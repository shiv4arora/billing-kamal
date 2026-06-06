import { prisma } from '../lib/prisma';
import { postSaleInvoice, postPaymentIn } from '../services/ledgerService';

// ─────────────────────────────────────────────────────────────────────────────
// One-time backfill for invoices corrupted by the old "issue a draft via PUT"
// bug, where an invoice was flipped to status='issued' WITHOUT posting the
// ledger, moving stock, or updating the customer balance.
//
// Detection: an issued/completed/paid invoice that has a customer but NO
// `sale_invoice` ledger entry. Such an invoice never had ANY of the issue
// side-effects applied, so it is safe to apply them all now:
//   1. sale_invoice ledger debit (full grand total)
//   2. payment_in ledger credit (if amountPaid > 0)
//   3. customer balance += (grandTotal - amountPaid)
//   4. stock decrement + 'sale' stock-ledger row for each line item
//
// Usage:
//   DRY=1 npx tsx src/scripts/backfillSaleLedger.ts   # preview only
//         npx tsx src/scripts/backfillSaleLedger.ts   # apply
//   STOCK=0 ... npx tsx ...                            # skip stock fix (ledger only)
// ─────────────────────────────────────────────────────────────────────────────

function parseItems(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

async function main() {
  const dryRun = process.env.DRY === '1';
  const fixStock = process.env.STOCK !== '0';

  const invoices = await prisma.saleInvoice.findMany({
    where: { status: { in: ['issued', 'completed', 'paid'] }, NOT: { customerId: null } },
    orderBy: { createdAt: 'asc' },
  });

  const broken: typeof invoices = [];
  for (const inv of invoices) {
    const ledger = await prisma.ledgerEntry.findFirst({
      where: { referenceId: inv.id, type: 'sale_invoice' },
    });
    if (!ledger) broken.push(inv);
  }

  console.log(`Scanned ${invoices.length} issued/completed/paid invoices.`);
  console.log(`Found ${broken.length} missing their ledger entry.\n`);
  for (const inv of broken) {
    const total = Number(inv.grandTotal) || 0;
    const paid = Number(inv.amountPaid) || 0;
    console.log(`  ${inv.invoiceNumber || inv.id}  ${inv.customerName}  total=${total}  paid=${paid}  owed=${total - paid}`);
  }

  if (dryRun) { console.log('\nDRY run — no changes written. Re-run without DRY=1 to apply.'); return; }
  if (broken.length === 0) { console.log('Nothing to fix.'); return; }

  console.log(`\nApplying fixes (stock fix: ${fixStock ? 'ON' : 'OFF'})…\n`);
  for (const inv of broken) {
    const total = Number(inv.grandTotal) || 0;
    const paid = Number(inv.amountPaid) || 0;
    const items = parseItems(inv.items);

    await prisma.$transaction(async (tx) => {
      // 1. Sale invoice ledger debit
      await postSaleInvoice(tx, {
        customerId: inv.customerId!, customerName: inv.customerName,
        date: inv.date, invoiceId: inv.id, invoiceNo: inv.invoiceNumber || '', amount: total,
      });

      // 2. Payment-in credit (if any was recorded on the invoice)
      if (paid > 0) {
        await postPaymentIn(tx, {
          customerId: inv.customerId!, customerName: inv.customerName,
          date: inv.paymentDate || inv.date, amount: paid, method: inv.paymentMethod,
          referenceId: inv.id, referenceNo: inv.invoiceNumber || '',
          narration: `Payment received against ${inv.invoiceNumber || ''} (${inv.paymentMethod})`,
        });
      }

      // 3. Customer balance
      await tx.customer.update({
        where: { id: inv.customerId! },
        data: { balance: { increment: total - paid } },
      });

      // 4. Stock — only if no stock-ledger rows exist for this invoice yet
      if (fixStock) {
        const existingStock = await tx.stockLedger.findFirst({ where: { referenceId: inv.id } });
        if (!existingStock) {
          for (const item of items) {
            if (!item.productId) continue;
            const qty = Number(item.quantity) || 0;
            if (qty <= 0) continue;
            await tx.stockLedger.create({
              data: {
                productId: item.productId, date: inv.date, movementType: 'sale',
                quantity: -qty, referenceId: inv.id, referenceNo: inv.invoiceNumber || '',
              },
            });
            await tx.product.update({
              where: { id: item.productId },
              data: { currentStock: { decrement: qty } },
            });
          }
        }
      }
    });
    console.log(`  ✓ healed ${inv.invoiceNumber || inv.id}`);
  }
  console.log(`\nDone. Healed ${broken.length} invoice(s).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
