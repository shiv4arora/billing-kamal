import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Resolves sale invoices that SHARE an invoice number (e.g. SI-0061 appearing
// twice), caused by the old non-atomic counter minting the same number to two
// records under concurrency.
//
// For each group of records sharing a number:
//   • If the records are CONTENT-IDENTICAL (same customer, date, grand total and
//     line items) → they are true accidental duplicates. One is kept and the
//     rest are deleted with a full reversal: their stock movements are undone
//     (only if they had any), their ledger entries removed, the record deleted.
//   • If they DIFFER → reported only (a human must decide / renumber); never
//     auto-deleted.
//   The kept record is the one that looks most "real": has a ledger entry, then
//   live status, then the earliest created.
//
// Finally all affected customer balances are rebuilt from the ledger.
//
// Usage:
//   DRY=1 npx tsx src/scripts/resolveDuplicateInvoices.ts   # preview only
//         npx tsx src/scripts/resolveDuplicateInvoices.ts   # backup + apply
//   NOBACKUP=1 ... npx tsx ...                                # skip the DB backup
// ─────────────────────────────────────────────────────────────────────────────

const LIVE = ['issued', 'completed', 'paid'];

function parseItems(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

function itemFingerprint(raw: any): string {
  const items = parseItems(raw)
    .map((i: any) => `${i.productId || i.productName || ''}:${Number(i.quantity) || 0}:${Number(i.unitPrice) || 0}:${Number(i.discountPct) || 0}`)
    .sort();
  return items.join('|');
}

function signature(inv: any): string {
  return [inv.customerId || '', inv.date || '', Math.round((Number(inv.grandTotal) || 0) * 100), itemFingerprint(inv.items)].join('#');
}

function backupDatabase(): string | null {
  const url = process.env.DATABASE_URL || 'file:./billing.db';
  if (!url.startsWith('file:')) { console.warn('⚠ DATABASE_URL is not file: — skipping backup.'); return null; }
  const rel = url.replace(/^file:/, '');
  const dbPath = path.isAbsolute(rel) ? rel : path.resolve(__dirname, '../../prisma', rel);
  if (!fs.existsSync(dbPath)) { console.warn(`⚠ DB not found at ${dbPath} — skipping backup.`); return null; }
  const ts = new Date().toISOString().replace(/[:T]/g, '').slice(0, 15);
  const dest = `${dbPath}.backup-${ts.slice(0, 8)}-${ts.slice(8)}`;
  fs.copyFileSync(dbPath, dest);
  for (const ext of ['-wal', '-shm']) if (fs.existsSync(dbPath + ext)) fs.copyFileSync(dbPath + ext, dest + ext);
  return dest;
}

async function rebuildBalance(customerId: string | null) {
  if (!customerId) return;
  const rows = await prisma.ledgerEntry.findMany({ where: { partyType: 'customer', partyId: customerId } });
  const bal = Math.round(rows.reduce((s, r) => s + (Number(r.debit) || 0) - (Number(r.credit) || 0), 0) * 100) / 100;
  await prisma.customer.update({ where: { id: customerId }, data: { balance: bal } });
}

async function main() {
  const dryRun = process.env.DRY === '1';

  const invoices = await prisma.saleInvoice.findMany({ where: { NOT: { invoiceNumber: null } }, orderBy: { createdAt: 'asc' } });
  const byNumber = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    const n = inv.invoiceNumber!;
    if (!byNumber.has(n)) byNumber.set(n, []);
    byNumber.get(n)!.push(inv);
  }
  const groups = [...byNumber.entries()].filter(([, l]) => l.length > 1);

  if (groups.length === 0) { console.log('No invoice numbers are shared by multiple records. Nothing to do.'); return; }

  console.log(`Found ${groups.length} invoice number(s) used by multiple records:\n`);

  const affectedCustomers = new Set<string>();
  const toDelete: any[] = [];
  const manual: string[] = [];

  for (const [num, list] of groups) {
    const sigs = new Set(list.map(signature));
    // figure out ledger presence per record
    const withMeta = await Promise.all(list.map(async (inv) => {
      const led = await prisma.ledgerEntry.findFirst({ where: { referenceId: inv.id, type: 'sale_invoice' } });
      return { inv, hasLedger: !!led };
    }));

    console.log(`  ${num}: ${list.length} records — ${sigs.size === 1 ? 'IDENTICAL content' : 'DIFFERENT content'}`);
    for (const { inv, hasLedger } of withMeta) {
      console.log(`     id=${inv.id} total=${inv.grandTotal} status=${inv.status} ledger=${hasLedger ? 'yes' : 'no'} created=${inv.createdAt.toISOString().slice(0, 16)}`);
    }

    if (sigs.size !== 1) {
      manual.push(num);
      console.log('     ↳ content differs — left for manual review (renumber or delete in the UI).\n');
      continue;
    }

    // Pick which to KEEP: ledger entry > live status > earliest created
    const scored = withMeta.map(m => ({
      ...m,
      score: (m.hasLedger ? 2 : 0) + (LIVE.includes(m.inv.status) ? 1 : 0),
    }));
    scored.sort((a, b) => b.score - a.score || (a.inv.createdAt < b.inv.createdAt ? -1 : 1));
    const keep = scored[0];
    console.log(`     ↳ keeping id=${keep.inv.id}; deleting ${scored.length - 1} duplicate(s).\n`);
    for (const m of scored.slice(1)) { toDelete.push(m.inv); if (m.inv.customerId) affectedCustomers.add(m.inv.customerId); }
    if (keep.inv.customerId) affectedCustomers.add(keep.inv.customerId);
  }

  if (dryRun) { console.log('DRY run — no changes written. Re-run without DRY=1 to apply.'); return; }
  if (toDelete.length === 0) { console.log('No auto-resolvable duplicates. Manual review needed for: ' + (manual.join(', ') || 'none')); return; }

  if (process.env.NOBACKUP !== '1') { const b = backupDatabase(); if (b) console.log(`💾 Backup created: ${b}\n`); }

  for (const inv of toDelete) {
    await prisma.$transaction(async (tx) => {
      const items = parseItems(inv.items);
      const hadStock = await tx.stockLedger.findFirst({ where: { referenceId: inv.id } });
      await tx.stockLedger.deleteMany({ where: { referenceId: inv.id } });
      if (hadStock) {
        for (const item of items) {
          if (item.productId && Number(item.quantity) > 0) {
            await tx.product.update({ where: { id: item.productId }, data: { currentStock: { increment: Number(item.quantity) } } });
          }
        }
      }
      await tx.ledgerEntry.deleteMany({ where: { referenceId: inv.id } });
      await tx.saleInvoice.delete({ where: { id: inv.id } });
    });
    console.log(`  ✓ deleted duplicate ${inv.invoiceNumber} (id=${inv.id})`);
  }

  for (const cid of affectedCustomers) await rebuildBalance(cid);
  console.log(`\nRebuilt ${affectedCustomers.size} customer balance(s).`);
  if (manual.length) console.log(`\n⚠ Still need manual review (different content): ${manual.join(', ')}`);
  console.log('\nDone.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
