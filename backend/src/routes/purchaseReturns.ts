import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { postPurchaseReturn } from '../services/ledgerService';

const router = Router();

function parseItems(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

async function nextReturnNumber(tx: any): Promise<string> {
  const row = await tx.counter.findUnique({ where: { key: 'purchaseReturn' } });
  if (!row) throw new Error("Counter 'purchaseReturn' not found");
  const n = row.value;
  await tx.counter.update({ where: { key: 'purchaseReturn' }, data: { value: n + 1 } });
  return `DR-${String(n).padStart(4, '0')}`;
}

/* GET /purchase-returns */
router.get('/', async (_req, res, next) => {
  try {
    const returns = await prisma.purchaseReturn.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(returns.map(r => ({ ...r, items: parseItems(r.items) })));
  } catch (err) { next(err); }
});

/* GET /purchase-returns/:id */
router.get('/:id', async (req, res, next) => {
  try {
    const r = await prisma.purchaseReturn.findUnique({ where: { id: req.params.id } });
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json({ ...r, items: parseItems(r.items) });
  } catch (err) { next(err); }
});

/* POST /purchase-returns */
router.post('/', async (req, res, next) => {
  try {
    const { date, originalInvoiceId, originalInvoiceNo, supplierId, supplierName, items, notes } = req.body;
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

        // Reduce stock (goods going back to supplier)
        const prod = await tx.product.findUnique({ where: { id: item.productId } });
        if (prod && prod.currentStock < qty) {
          throw new Error(`Insufficient stock for "${prod.name}" — have ${prod.currentStock}, returning ${qty}`);
        }
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: { decrement: qty } },
        });
        await tx.stockLedger.create({
          data: {
            productId: item.productId,
            date: today,
            movementType: 'purchase_return',
            quantity: -qty,
            referenceId: '',
            referenceNo: returnNumber,
          },
        });
        resolvedItems.push({ ...item, quantity: qty, unitPrice, gstRate, lineTotal });
      }

      const grandTotal = subtotal + totalGST;

      // Post ledger + adjust supplier balance
      if (supplierId) {
        await postPurchaseReturn(tx, {
          supplierId, supplierName: supplierName || '',
          date: today, amount: grandTotal,
          referenceId: '', referenceNo: returnNumber,
        });
        await tx.supplier.update({
          where: { id: supplierId },
          data: { balance: { decrement: grandTotal } },
        });
      }

      return tx.purchaseReturn.create({
        data: {
          returnNumber, date: today,
          originalInvoiceId: originalInvoiceId || null,
          originalInvoiceNo: originalInvoiceNo || '',
          supplierId: supplierId || null,
          supplierName: supplierName || '',
          items: JSON.stringify(resolvedItems),
          subtotal, totalGST, grandTotal,
          notes: notes || '',
        },
      });
    });

    res.json({ ...result, items: parseItems(result.items) });
  } catch (err: any) {
    if (err.message?.startsWith('Insufficient')) return res.status(400).json({ error: err.message });
    next(err);
  }
});

/* PUT /purchase-returns/:id — reverse old, apply new */
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.purchaseReturn.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { date, originalInvoiceId, originalInvoiceNo, supplierId, supplierName, items, notes } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'Add at least one item' });

    const result = await prisma.$transaction(async (tx) => {
      const today = date || new Date().toISOString().slice(0, 10);
      const oldItems = parseItems(existing.items);

      // Reverse old stock (restore what was deducted)
      for (const item of oldItems) {
        const qty = Number(item.quantity);
        await tx.product.update({ where: { id: item.productId }, data: { currentStock: { increment: qty } } });
      }
      await tx.stockLedger.deleteMany({ where: { referenceNo: existing.returnNumber, movementType: 'purchase_return' } });

      // Reverse old ledger + balance
      await tx.ledgerEntry.deleteMany({ where: { referenceNo: existing.returnNumber, type: 'purchase_return' } });
      if (existing.supplierId) {
        await tx.supplier.update({ where: { id: existing.supplierId }, data: { balance: { increment: existing.grandTotal } } });
      }

      // Apply new items
      let subtotal = 0, totalGST = 0;
      const resolvedItems: any[] = [];
      for (const item of items) {
        const qty = Number(item.quantity) || 0;
        const unitPrice = Number(item.unitPrice) || 0;
        const gstRate = Number(item.gstRate) || 0;
        const lineSubtotal = qty * unitPrice;
        const lineGST = lineSubtotal * gstRate / 100;
        subtotal += lineSubtotal;
        totalGST += lineGST;
        const prod = await tx.product.findUnique({ where: { id: item.productId } });
        if (prod && prod.currentStock < qty) throw new Error(`Insufficient stock for "${prod.name}"`);
        await tx.product.update({ where: { id: item.productId }, data: { currentStock: { decrement: qty } } });
        await tx.stockLedger.create({ data: { productId: item.productId, date: today, movementType: 'purchase_return', quantity: -qty, referenceId: existing.id, referenceNo: existing.returnNumber } });
        resolvedItems.push({ ...item, quantity: qty, unitPrice, gstRate, lineTotal: lineSubtotal + lineGST });
      }
      const grandTotal = subtotal + totalGST;

      if (supplierId) {
        await postPurchaseReturn(tx, { supplierId, supplierName: supplierName || '', date: today, amount: grandTotal, referenceId: existing.id, referenceNo: existing.returnNumber });
        await tx.supplier.update({ where: { id: supplierId }, data: { balance: { decrement: grandTotal } } });
      }

      return tx.purchaseReturn.update({
        where: { id: existing.id },
        data: { date: today, originalInvoiceId: originalInvoiceId || null, originalInvoiceNo: originalInvoiceNo || '', supplierId: supplierId || null, supplierName: supplierName || '', items: JSON.stringify(resolvedItems), subtotal, totalGST, grandTotal, notes: notes || '' },
      });
    });

    res.json({ ...result, items: parseItems(result.items) });
  } catch (err: any) {
    if (err.message?.startsWith('Insufficient')) return res.status(400).json({ error: err.message });
    next(err);
  }
});

/* DELETE /purchase-returns/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.purchaseReturn.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const items = parseItems(existing.items);

    await prisma.$transaction(async (tx) => {
      const today = new Date().toISOString().slice(0, 10);

      // Restore stock
      for (const item of items) {
        const qty = Number(item.quantity);
        await tx.product.update({ where: { id: item.productId }, data: { currentStock: { increment: qty } } });
        await tx.stockLedger.create({
          data: { productId: item.productId, date: today, movementType: 'purchase_return_reversal', quantity: qty, referenceId: existing.id, referenceNo: existing.returnNumber },
        });
      }

      await tx.ledgerEntry.deleteMany({ where: { referenceNo: existing.returnNumber, type: 'purchase_return' } });
      if (existing.supplierId) {
        await tx.supplier.update({ where: { id: existing.supplierId }, data: { balance: { increment: existing.grandTotal } } });
      }

      await tx.purchaseReturn.delete({ where: { id: existing.id } });
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
