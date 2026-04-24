import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

function parseItems(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

async function nextQuotationNumber(tx: any): Promise<string> {
  const row = await tx.counter.findUnique({ where: { key: 'quotation' } });
  if (!row) throw new Error("Counter 'quotation' not found");
  const n = row.value;
  await tx.counter.update({ where: { key: 'quotation' }, data: { value: n + 1 } });
  return `QT-${String(n).padStart(4, '0')}`;
}

function pickData(body: any) {
  const { date, validUntil, customerId, customerName, customerPlace, customerType, customerAddress, customerGstin,
    items, subtotal, totalDiscount, totalGST, grandTotal, notes, status } = body;
  return {
    date: date || new Date().toISOString().slice(0, 10),
    validUntil: validUntil || '',
    customerId: customerId || null,
    customerName: customerName || '',
    customerPlace: customerPlace || '',
    customerType: customerType || 'retail',
    customerAddress: customerAddress || '',
    customerGstin: customerGstin || '',
    items: Array.isArray(items) ? JSON.stringify(items) : (items || '[]'),
    subtotal: Number(subtotal) || 0,
    totalDiscount: Number(totalDiscount) || 0,
    totalGST: Number(totalGST) || 0,
    grandTotal: Number(grandTotal) || 0,
    notes: notes || '',
    status: status || 'draft',
  };
}

/* GET /quotations */
router.get('/', async (req, res, next) => {
  try {
    const where: any = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.customerId) where.customerId = req.query.customerId;
    const quotations = await prisma.quotation.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(quotations.map(q => ({ ...q, items: parseItems(q.items) })));
  } catch (err) { next(err); }
});

/* GET /quotations/:id */
router.get('/:id', async (req, res, next) => {
  try {
    const q = await prisma.quotation.findUnique({ where: { id: req.params.id } });
    if (!q) return res.status(404).json({ error: 'Not found' });
    res.json({ ...q, items: parseItems(q.items) });
  } catch (err) { next(err); }
});

/* POST /quotations */
router.post('/', async (req, res, next) => {
  try {
    const q = await prisma.$transaction(async (tx) => {
      const quotationNumber = await nextQuotationNumber(tx);
      return tx.quotation.create({ data: { quotationNumber, ...pickData(req.body) } });
    });
    res.json({ ...q, items: parseItems(q.items) });
  } catch (err) { next(err); }
});

/* PUT /quotations/:id */
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.quotation.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.convertedToInvoiceId) return res.status(400).json({ error: 'Cannot edit a converted quotation' });
    const q = await prisma.quotation.update({ where: { id: req.params.id }, data: pickData(req.body) });
    res.json({ ...q, items: parseItems(q.items) });
  } catch (err) { next(err); }
});

/* DELETE /quotations/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.quotation.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.convertedToInvoiceId) return res.status(400).json({ error: 'Cannot delete a converted quotation' });
    await prisma.quotation.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* POST /quotations/:id/convert — convert to sale invoice draft */
router.post('/:id/convert', async (req, res, next) => {
  try {
    const q = await prisma.quotation.findUnique({ where: { id: req.params.id } });
    if (!q) return res.status(404).json({ error: 'Not found' });
    if (q.convertedToInvoiceId) return res.status(400).json({ error: 'Already converted', invoiceId: q.convertedToInvoiceId });

    const result = await prisma.$transaction(async (tx) => {
      const inv = await tx.saleInvoice.create({
        data: {
          date: q.date,
          dueDate: q.validUntil || q.date,
          customerId: q.customerId,
          customerName: q.customerName,
          customerPlace: q.customerPlace,
          customerType: q.customerType,
          customerAddress: q.customerAddress,
          customerGstin: q.customerGstin,
          items: q.items,
          subtotal: q.subtotal,
          totalDiscount: q.totalDiscount,
          totalCGST: q.totalGST / 2,
          totalSGST: q.totalGST / 2,
          totalIGST: 0,
          totalGST: q.totalGST,
          grandTotal: q.grandTotal,
          roundOff: 0,
          amountPaid: 0,
          paymentMethod: 'cash',
          paymentStatus: 'unpaid',
          notes: q.notes ? `[From Quotation ${q.quotationNumber}] ${q.notes}` : `[From Quotation ${q.quotationNumber}]`,
          status: 'draft',
        },
      });
      await tx.quotation.update({
        where: { id: q.id },
        data: { status: 'accepted', convertedToInvoiceId: inv.id },
      });
      return inv;
    });

    res.json({ invoiceId: result.id });
  } catch (err) { next(err); }
});

export default router;
