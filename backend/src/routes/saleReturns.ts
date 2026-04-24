import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { postSaleReturn } from '../services/ledgerService';

const router = Router();

function parseItems(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

async function nextReturnNumber(tx: any): Promise<string> {
  const row = await tx.counter.findUnique({ where: { key: 'saleReturn' } });
  if (!row) throw new Error("Counter 'saleReturn' not found");
  const n = row.value;
  await tx.counter.update({ where: { key: 'saleReturn' }, data: { value: n + 1 } });
  return `CR-${String(n).padStart(4, '0')}`;
}

/* GET /sale-returns */
router.get('/', async (_req, res, next) => {
  try {
    const returns = await prisma.saleReturn.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(returns.map(r => ({ ...r, items: parseItems(r.items) })));
  } catch (err) { next(err); }
});

/* GET /sale-returns/:id */
router.get('/:id', async (req, res, next) => {
  try {
    const r = await prisma.saleReturn.findUnique({ where: { id: req.params.id } });
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json({ ...r, items: parseItems(r.items) });
  } catch (err) { next(err); }
});

/* POST /sale-returns */
router.post('/', async (req, res, next) => {
  try {
    const { date, originalInvoiceId, originalInvoiceNo, customerId, customerName, items, notes } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'Add at least one item' });

    const result = await prisma.$transaction(async (tx) => {
      const returnNumber = await nextReturnNumber(tx);
      const today = date || new Date().toISOString().slice(0, 10);

      let subtotal = 0, totalGST = 0;
      const resolvedItems: any[] = [];

      for (const item of items) {
        const qty = Number(item.quantity) || 0;
        const unitPrice = Number(item.unitPrice) || 0;
        const gstRate = Number(item.gstRate) || 0;
        const lineSubtotal = qty * unitPrice;
        const lineGST = lineSubtotal * gstRate / 100;
        const lineTotal = lineSubtotal + lineGST;
        subtotal += lineSubtotal;
        totalGST += lineGST;

        // Restore stock
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: { increment: qty } },
        });
        await tx.stockLedger.create({
          data: {
            productId: item.productId,
            date: today,
            movementType: 'sale_return',
            quantity: qty,
            referenceId: '',
            referenceNo: returnNumber,
          },
        });
        resolvedItems.push({ ...item, quantity: qty, unitPrice, gstRate, lineTotal });
      }

      const grandTotal = subtotal + totalGST;

      // Post ledger + adjust customer balance
      if (customerId) {
        await postSaleReturn(tx, {
          customerId, customerName: customerName || '',
          date: today, amount: grandTotal,
          referenceId: '', referenceNo: returnNumber,
        });
        await tx.customer.update({
          where: { id: customerId },
          data: { balance: { decrement: grandTotal } },
        });
      }

      return tx.saleReturn.create({
        data: {
          returnNumber, date: today,
          originalInvoiceId: originalInvoiceId || null,
          originalInvoiceNo: originalInvoiceNo || '',
          customerId: customerId || null,
          customerName: customerName || '',
          items: JSON.stringify(resolvedItems),
          subtotal, totalGST, grandTotal,
          notes: notes || '',
        },
      });
    });

    res.json({ ...result, items: parseItems(result.items) });
  } catch (err: any) {
    next(err);
  }
});

/* DELETE /sale-returns/:id — reverse everything */
router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.saleReturn.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const items = parseItems(existing.items);

    await prisma.$transaction(async (tx) => {
      const today = new Date().toISOString().slice(0, 10);

      // Reverse stock (reduce what was restored)
      for (const item of items) {
        const qty = Number(item.quantity);
        await tx.product.update({ where: { id: item.productId }, data: { currentStock: { decrement: qty } } });
        await tx.stockLedger.create({
          data: { productId: item.productId, date: today, movementType: 'sale_return_reversal', quantity: -qty, referenceId: existing.id, referenceNo: existing.returnNumber },
        });
      }

      // Reverse ledger entries and restore customer balance
      await tx.ledgerEntry.deleteMany({ where: { referenceNo: existing.returnNumber, type: 'sale_return' } });
      if (existing.customerId) {
        await tx.customer.update({ where: { id: existing.customerId }, data: { balance: { increment: existing.grandTotal } } });
      }

      await tx.saleReturn.delete({ where: { id: existing.id } });
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
