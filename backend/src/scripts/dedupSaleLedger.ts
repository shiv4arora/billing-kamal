import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Cleans up DUPLICATE sale ledger entries (the same invoice posted to the ledger
// more than once — e.g. "Sale Invoice SI-0061" appearing twice) and then rebuilds
// every customer's balance from the ledger so it is always authoritative.
//
// What it does:
//   1. Groups sale_invoice / payment_in / sale_return entries by (referenceId,type).
//      For any group with more than one entry it keeps a single entry (preferring
//      the one whose debit/credit matches the invoice's current grandTotal) and
//      deletes the rest.
//   2. Recomputes each customer's balance = Σ debit − Σ credit from the remaining
//      ledger entries.
//   3. Reports (does not delete) any sale invoices that SHARE an invoice number —
//      those are separate records and need a human to decide which to remove.
//
// Usage:
//   DRY=1 npx tsx src/scripts/dedupSaleLedger.ts   # preview only (no backup)
//         npx tsx src/scripts/dedupSaleLedger.ts   # backup + apply
//   NOBACKUP=1 ... npx tsx ...                      # skip the DB backup
// ─────────────────────────────────────────────────────────────────────────────

function backupDatabase(): string | null {
  const url = process.env.DATABASE_URL || 'file:./billing.db';
  if (!url.startsWith('file:')) { console.warn(`⚠ DATABASE_URL is not file: — skipping backup.`); return null; }
  const rel = url.replace(/^file:/, '');
  const dbPath = path.isAbsolute(rel) ? rel : path.resolve(__dirname, '../../prisma', rel);
  if (!fs.existsSync(dbPath)) { console.warn(`⚠ DB not found at ${dbPath} — skipping backup.`); return null; }
  const ts = new Date().toISOString().replace(/[:T]/g, '').slice(0, 15);
  const dest = `${dbPath}.backup-${ts.slice(0, 8)}-${ts.slice(8)}`;
  fs.copyFileSync(dbPath, dest);
  for (const ext of ['-wal', '-shm']) if (fs.existsSync(dbPath + ext)) fs.copyFileSync(dbPath + ext, dest + ext);
  return dest;
}

async function main() {
  const dryRun = process.env.DRY === '1';

  // ── 1. Find duplicate ledger entries grouped by referenceId + type ──
  const entries = await prisma.ledgerEntry.findMany({
    where: { referenceId: { not: '' }, type: { in: ['sale_invoice', 'payment_in', 'sale_return'] } },
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = `${e.referenceId}|${e.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  // Pre-load invoice grand totals so we can keep the entry that matches
  const invIds = [...new Set(entries.filter(e => e.type === 'sale_invoice').map(e => e.referenceId))];
  const invoices = await prisma.saleInvoice.findMany({ where: { id: { in: invIds } } });
  const invTotal = new Map(invoices.map(i => [i.id, Number(i.grandTotal) || 0]));

  const toDelete: string[] = [];
  let dupGroups = 0;
  for (const [key, list] of groups) {
    if (list.length <= 1) continue;
    dupGroups++;
    const [refId, type] = key.split('|');
    // Choose which entry to KEEP
    let keep = list[0];
    if (type === 'sale_invoice') {
      const target = invTotal.get(refId);
      const match = list.find(e => Math.abs(Number(e.debit) - (target ?? -1)) < 0.01);
      if (match) keep = match;
    }
    const refNo = list[0].referenceNo || refId;
    console.log(`  DUP ${type} ${refNo}: ${list.length} entries — keeping debit=${keep.debit} credit=${keep.credit}, deleting ${list.length - 1}`);
    for (const e of list) if (e.id !== keep.id) toDelete.push(e.id);
  }
  console.log(`\nFound ${dupGroups} duplicated ledger group(s); ${toDelete.length} entr(y/ies) to delete.`);

  // ── 3. Report sale invoices that share an invoice number (separate records) ──
  const allInvoices = await prisma.saleInvoice.findMany({ where: { NOT: { invoiceNumber: null } } });
  const byNumber = new Map<string, typeof allInvoices>();
  for (const inv of allInvoices) {
    const n = inv.invoiceNumber!;
    if (!byNumber.has(n)) byNumber.set(n, []);
    byNumber.get(n)!.push(inv);
  }
  const dupNumbers = [...byNumber.entries()].filter(([, l]) => l.length > 1);
  if (dupNumbers.length) {
    console.log(`\n⚠ ${dupNumbers.length} invoice number(s) used by MORE THAN ONE record (review & delete the wrong one in the UI):`);
    for (const [num, list] of dupNumbers) {
      for (const inv of list) {
        console.log(`    ${num}  id=${inv.id}  ${inv.customerName}  total=${inv.grandTotal}  status=${inv.status}  created=${inv.createdAt.toISOString().slice(0,10)}`);
      }
    }
  }

  if (dryRun) { console.log('\nDRY run — no changes written.'); return; }

  if (process.env.NOBACKUP !== '1') {
    const b = backupDatabase();
    if (b) console.log(`\n💾 Backup created: ${b}`);
  }

  // ── Apply deletions ──
  if (toDelete.length) {
    await prisma.ledgerEntry.deleteMany({ where: { id: { in: toDelete } } });
    console.log(`Deleted ${toDelete.length} duplicate ledger entr(y/ies).`);
  }

  // ── 2. Rebuild every customer balance from the ledger ──
  const customers = await prisma.customer.findMany();
  let fixed = 0;
  for (const c of customers) {
    const rows = await prisma.ledgerEntry.findMany({ where: { partyType: 'customer', partyId: c.id } });
    const bal = rows.reduce((s, r) => s + (Number(r.debit) || 0) - (Number(r.credit) || 0), 0);
    const rounded = Math.round(bal * 100) / 100;
    if (Math.abs(rounded - (Number(c.balance) || 0)) > 0.01) {
      await prisma.customer.update({ where: { id: c.id }, data: { balance: rounded } });
      console.log(`  balance ${c.name}: ${c.balance} → ${rounded}`);
      fixed++;
    }
  }
  console.log(`\nDone. Rebuilt ${fixed} customer balance(s).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
