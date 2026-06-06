import { prisma } from '../lib/prisma';
import { postSaleInvoice } from '../services/ledgerService';

// One-time backfill: find issued/completed/paid sale invoices that have a
// customer but NO sale_invoice ledger entry (corrupted by the old draft→issue
// PUT bug), and create the missing ledger entry + fix the customer balance.
// Run with:  DRY=1 npx tsx src/scripts/backfillSaleLedger.ts   (preview only)
//            npx tsx src/scripts/backfillSaleLedger.ts          (apply)

async function main() {
  const dryRun = process.env.DRY === '1';
  const invoices = await prisma.saleInvoice.findMany({
    where: { status: { in: ['issued', 'completed', 'paid'] }, NOT: { customerId: null } },
  });

  const broken: typeof invoices = [];
  for (const inv of invoices) {
    const ledger = await prisma.ledgerEntry.findFirst({
      where: { referenceId: inv.id, type: 'sale_invoice' },
    });
    if (!ledger) broken.push(inv);
  }

  console.log(`Scanned ${invoices.length} issued invoices. Found ${broken.length} missing a ledger entry.`);
  for (const inv of broken) {
    const owed = (Number(inv.grandTotal) || 0) - (Number(inv.amountPaid) || 0);
    console.log(`  ${inv.invoiceNumber || inv.id}  ${inv.customerName}  total=${inv.grandTotal}  paid=${inv.amountPaid}  owed=${owed}`);
  }

  if (dryRun) { console.log('\nDRY run — no changes written.'); return; }
  if (broken.length === 0) { console.log('Nothing to fix.'); return; }

  for (const inv of broken) {
    await prisma.$transaction(async (tx) => {
      await postSaleInvoice(tx, {
        customerId: inv.customerId!, customerName: inv.customerName,
        date: inv.date, invoiceId: inv.id, invoiceNo: inv.invoiceNumber || '',
        amount: Number(inv.grandTotal) || 0,
      });
      await tx.customer.update({
        where: { id: inv.customerId! },
        data: { balance: { increment: (Number(inv.grandTotal) || 0) - (Number(inv.amountPaid) || 0) } },
      });
    });
    console.log(`  ✓ healed ${inv.invoiceNumber || inv.id}`);
  }
  console.log(`\nDone. Healed ${broken.length} invoice(s).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
