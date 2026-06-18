import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { postPurchaseInvoice, postPaymentOut } from '../services/ledgerService';

// ─────────────────────────────────────────────────────────────────────────────
// Full reconciliation of every purchase invoice against its supplier ledger
// entries (mirror of reconcileSaleLedger for the buy side).
//
//   • LIVE invoice (issued/paid, with a supplier):
//       - exactly ONE purchase_invoice credit entry = grandTotal, correct
//         date/party/narration. Duplicates deleted; missing one created; wrong
//         one corrected.
//       - if amountPaid > 0 but NO payment_out entry exists, one is created.
//   • NON-LIVE invoice (draft, or no supplier): must carry no purchase_invoice
//     / payment_out entries — any are removed.
//   • purchase_return entries are never touched.
//
// Then every supplier balance is rebuilt from the ledger as Σ(credit − debit).
//
// Usage:
//   DRY=1 npx tsx src/scripts/reconcilePurchaseLedger.ts   # preview (no backup)
//         npx tsx src/scripts/reconcilePurchaseLedger.ts   # backup + apply
//   NOBACKUP=1 ... npx tsx ...                              # skip the DB backup
// ─────────────────────────────────────────────────────────────────────────────

const LIVE = ['issued', 'paid', 'completed'];

function parseItems(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw || '[]'); } catch { return []; }
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

async function main() {
  const dryRun = process.env.DRY === '1';
  const invoices = await prisma.purchaseInvoice.findMany({ orderBy: { createdAt: 'asc' } });

  const actions: string[] = [];
  let created = 0, fixed = 0, deletedDup = 0, strippedNonLive = 0, healedPay = 0;

  if (!dryRun && process.env.NOBACKUP !== '1') {
    const b = backupDatabase();
    if (b) console.log(`💾 Backup created: ${b}\n`);
  }

  for (const inv of invoices) {
    const live = LIVE.includes(inv.status) && !!inv.supplierId;
    const total = Number(inv.grandTotal) || 0;
    const paid = Number(inv.amountPaid) || 0;
    const ref = inv.invoiceNumber || inv.id;

    const invEntries = await prisma.ledgerEntry.findMany({
      where: { referenceId: inv.id, type: 'purchase_invoice' },
      orderBy: { createdAt: 'asc' },
    });
    const payEntries = await prisma.ledgerEntry.findMany({
      where: { referenceId: inv.id, type: 'payment_out' },
    });

    if (!live) {
      if (invEntries.length || payEntries.length) {
        actions.push(`  STRIP  ${ref} (${inv.status}) — removing ${invEntries.length} invoice + ${payEntries.length} payment entr(ies)`);
        strippedNonLive++;
        if (!dryRun) await prisma.ledgerEntry.deleteMany({ where: { referenceId: inv.id, type: { in: ['purchase_invoice', 'payment_out'] } } });
      }
      continue;
    }

    if (invEntries.length === 0) {
      actions.push(`  CREATE ${ref} — missing purchase_invoice entry (credit ${total})`);
      created++;
      if (!dryRun) {
        await postPurchaseInvoice(prisma as any, {
          supplierId: inv.supplierId!, supplierName: inv.supplierName,
          date: inv.date, invoiceId: inv.id, invoiceNo: inv.invoiceNumber || '', amount: total,
        });
      }
    } else {
      const keep = invEntries[0];
      const extras = invEntries.slice(1);
      if (extras.length) {
        actions.push(`  DEDUP  ${ref} — deleting ${extras.length} duplicate purchase_invoice entr(ies)`);
        deletedDup += extras.length;
        if (!dryRun) await prisma.ledgerEntry.deleteMany({ where: { id: { in: extras.map(e => e.id) } } });
      }
      const wrong =
        Math.abs(Number(keep.credit) - total) > 0.01 ||
        keep.date !== inv.date ||
        keep.partyId !== inv.supplierId ||
        keep.partyName !== inv.supplierName;
      if (wrong) {
        actions.push(`  FIX    ${ref} — credit ${keep.credit}→${total}, date ${keep.date}→${inv.date}`);
        fixed++;
        if (!dryRun) {
          await prisma.ledgerEntry.update({
            where: { id: keep.id },
            data: {
              credit: total, debit: 0, date: inv.date,
              partyId: inv.supplierId, partyName: inv.supplierName,
              narration: `Purchase Invoice ${inv.invoiceNumber || ''}`,
            },
          });
        }
      }
    }

    if (paid > 0 && payEntries.length === 0) {
      actions.push(`  PAY    ${ref} — creating missing payment_out entry (${paid})`);
      healedPay++;
      if (!dryRun) {
        await postPaymentOut(prisma as any, {
          supplierId: inv.supplierId!, supplierName: inv.supplierName,
          date: inv.date, amount: paid, method: inv.paymentMethod,
          referenceId: inv.id, referenceNo: inv.invoiceNumber || '',
        });
      }
    }
  }

  console.log(`Scanned ${invoices.length} purchase invoices.`);
  if (actions.length) { console.log('\nChanges:'); actions.forEach(a => console.log(a)); }
  else console.log('All purchase_invoice ledger entries already correct.');
  console.log(`\nSummary: create=${created} fix=${fixed} dedup=${deletedDup} strip=${strippedNonLive} payHeal=${healedPay}`);

  const suppliers = await prisma.supplier.findMany();
  let balFixed = 0;
  for (const sup of suppliers) {
    const rows = await prisma.ledgerEntry.findMany({ where: { partyType: 'supplier', partyId: sup.id } });
    const bal = Math.round(rows.reduce((s, r) => s + (Number(r.credit) || 0) - (Number(r.debit) || 0), 0) * 100) / 100;
    if (Math.abs(bal - (Number(sup.balance) || 0)) > 0.01) {
      console.log(`  balance ${sup.name}: ${sup.balance} → ${bal}`);
      balFixed++;
      if (!dryRun) await prisma.supplier.update({ where: { id: sup.id }, data: { balance: bal } });
    }
  }
  console.log(`\nSupplier balances ${dryRun ? 'that WOULD be' : ''} corrected: ${balFixed}`);
  if (dryRun) console.log('\nDRY run — no changes written. Re-run without DRY=1 to apply.');
  else console.log('\nDone.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
