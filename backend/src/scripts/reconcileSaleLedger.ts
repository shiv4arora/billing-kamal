import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { postSaleInvoice, postPaymentIn } from '../services/ledgerService';

// ─────────────────────────────────────────────────────────────────────────────
// Full reconciliation of every sale invoice against its ledger entries.
//
// For each sale invoice it enforces the correct ledger state:
//   • LIVE invoice (issued / completed / paid, with a customer):
//       - exactly ONE sale_invoice debit entry, with debit = grandTotal and the
//         correct date / party / narration. Extra duplicates are deleted; a
//         missing entry is created; a wrong one is corrected.
//       - if amountPaid > 0 but NO payment_in entry exists (corruption), one is
//         created. Existing payment entries are left untouched.
//   • NON-LIVE invoice (draft / void, or no customer):
//       - must have NO sale_invoice / payment_in entries — any are removed.
//   • sale_return entries are never touched (they are real credit notes).
//
// Finally every customer's balance is rebuilt from the ledger (Σ debit − credit),
// so the cached balance always matches the entries exactly.
//
// Usage:
//   DRY=1 npx tsx src/scripts/reconcileSaleLedger.ts   # preview only (no backup)
//         npx tsx src/scripts/reconcileSaleLedger.ts   # backup + apply
//   NOBACKUP=1 ... npx tsx ...                          # skip the DB backup
// ─────────────────────────────────────────────────────────────────────────────

const LIVE = ['issued', 'completed', 'paid'];

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

async function main() {
  const dryRun = process.env.DRY === '1';
  const invoices = await prisma.saleInvoice.findMany({ orderBy: { createdAt: 'asc' } });

  const actions: string[] = [];
  let created = 0, fixed = 0, deletedDup = 0, strippedNonLive = 0, healedPay = 0;

  if (!dryRun && process.env.NOBACKUP !== '1') {
    const b = backupDatabase();
    if (b) console.log(`💾 Backup created: ${b}\n`);
  }

  for (const inv of invoices) {
    const live = LIVE.includes(inv.status) && !!inv.customerId;
    const total = Number(inv.grandTotal) || 0;
    const paid = Number(inv.amountPaid) || 0;
    const ref = inv.invoiceNumber || inv.id;

    const saleEntries = await prisma.ledgerEntry.findMany({
      where: { referenceId: inv.id, type: 'sale_invoice' },
      orderBy: { createdAt: 'asc' },
    });
    const payEntries = await prisma.ledgerEntry.findMany({
      where: { referenceId: inv.id, type: 'payment_in' },
    });

    if (!live) {
      // draft / void / no-customer → should carry no sale_invoice or payment_in entries
      if (saleEntries.length || payEntries.length) {
        actions.push(`  STRIP  ${ref} (${inv.status}) — removing ${saleEntries.length} sale + ${payEntries.length} payment entr(ies)`);
        strippedNonLive++;
        if (!dryRun) {
          await prisma.ledgerEntry.deleteMany({ where: { referenceId: inv.id, type: { in: ['sale_invoice', 'payment_in'] } } });
        }
      }
      continue;
    }

    // ── LIVE invoice ──
    if (saleEntries.length === 0) {
      actions.push(`  CREATE ${ref} — missing sale_invoice entry (debit ${total})`);
      created++;
      if (!dryRun) {
        await postSaleInvoice(prisma as any, {
          customerId: inv.customerId!, customerName: inv.customerName,
          date: inv.date, invoiceId: inv.id, invoiceNo: inv.invoiceNumber || '', amount: total,
        });
      }
    } else {
      const keep = saleEntries[0];
      // delete extras
      const extras = saleEntries.slice(1);
      if (extras.length) {
        actions.push(`  DEDUP  ${ref} — deleting ${extras.length} duplicate sale_invoice entr(ies)`);
        deletedDup += extras.length;
        if (!dryRun) await prisma.ledgerEntry.deleteMany({ where: { id: { in: extras.map(e => e.id) } } });
      }
      // fix the kept one if any field is off
      const wrong =
        Math.abs(Number(keep.debit) - total) > 0.01 ||
        keep.date !== inv.date ||
        keep.partyId !== inv.customerId ||
        keep.partyName !== inv.customerName;
      if (wrong) {
        actions.push(`  FIX    ${ref} — debit ${keep.debit}→${total}, date ${keep.date}→${inv.date}`);
        fixed++;
        if (!dryRun) {
          await prisma.ledgerEntry.update({
            where: { id: keep.id },
            data: {
              debit: total, credit: 0, date: inv.date,
              partyId: inv.customerId, partyName: inv.customerName,
              narration: `Sale Invoice ${inv.invoiceNumber || ''}`,
            },
          });
        }
      }
    }

    // heal a missing payment entry (corruption case only — don't touch real payments)
    if (paid > 0 && payEntries.length === 0) {
      actions.push(`  PAY    ${ref} — creating missing payment_in entry (${paid})`);
      healedPay++;
      if (!dryRun) {
        await postPaymentIn(prisma as any, {
          customerId: inv.customerId!, customerName: inv.customerName,
          date: inv.paymentDate || inv.date, amount: paid, method: inv.paymentMethod,
          referenceId: inv.id, referenceNo: inv.invoiceNumber || '',
          narration: `Payment received against ${inv.invoiceNumber || ''} (${inv.paymentMethod})`,
        });
      }
    }
  }

  console.log(`Scanned ${invoices.length} sale invoices.`);
  if (actions.length) { console.log('\nChanges:'); actions.forEach(a => console.log(a)); }
  else console.log('All sale_invoice ledger entries already correct.');
  console.log(`\nSummary: create=${created} fix=${fixed} dedup=${deletedDup} strip=${strippedNonLive} payHeal=${healedPay}`);

  // ── Rebuild every customer balance from the ledger ──
  const customers = await prisma.customer.findMany();
  let balFixed = 0;
  for (const c of customers) {
    const rows = await prisma.ledgerEntry.findMany({ where: { partyType: 'customer', partyId: c.id } });
    const bal = Math.round(rows.reduce((s, r) => s + (Number(r.debit) || 0) - (Number(r.credit) || 0), 0) * 100) / 100;
    if (Math.abs(bal - (Number(c.balance) || 0)) > 0.01) {
      console.log(`  balance ${c.name}: ${c.balance} → ${bal}`);
      balFixed++;
      if (!dryRun) await prisma.customer.update({ where: { id: c.id }, data: { balance: bal } });
    }
  }
  console.log(`\nCustomer balances ${dryRun ? 'that WOULD be' : ''} corrected: ${balFixed}`);
  if (dryRun) console.log('\nDRY run — no changes written. Re-run without DRY=1 to apply.');
  else console.log('\nDone.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
