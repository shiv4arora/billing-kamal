import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { nextSaleInvoiceNumber } from '../services/counters';
import { buildInvoiceTotals } from '../services/invoiceTotals';
import { postSaleInvoice, postPaymentIn, postSaleReturn } from '../services/ledgerService';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { status, customerId, from, to } = req.query as any;
    const where: any = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = from;
      if (to) where.date.lte = to;
    }
    const invoices = await prisma.saleInvoice.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(invoices);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const inv = await prisma.saleInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
    res.json(inv);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const inv = await prisma.saleInvoice.create({ data: req.body });
    res.status(201).json(inv);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const inv = await prisma.saleInvoice.update({ where: { id: req.params.id }, data: req.body });
    res.json(inv);
  } catch (err) { next(err); }
});

// ── ISSUE ────────────────────────────────────────────────────────────────────
router.post('/:id/issue', async (req, res, next) => {
  try {
    const existing = await prisma.saleInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
    if (existing.status !== 'draft') return res.status(400).json({ error: 'Only draft invoices can be issued' });

    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    const s: any = settings?.data || {};
    const isInterState = s.tax?.intraState === false;
    const prefix = s.invoice?.salePrefix || 'SI';

    const rawItems = existing.items as any[];
    const totals = buildInvoiceTotals(rawItems, isInterState);
    const paid = Number(existing.amountPaid);
    const payStatus = paid >= totals.grandTotal - 0.01 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

    const issued = await prisma.$transaction(async (tx) => {
      const invNo = await nextSaleInvoiceNumber(prefix);

      const inv = await tx.saleInvoice.update({
        where: { id: existing.id },
        data: {
          invoiceNumber: invNo,
          items: totals.items,
          subtotal: totals.subtotal, totalDiscount: totals.totalDiscount,
          totalCGST: totals.totalCGST, totalSGST: totals.totalSGST,
          totalIGST: totals.totalIGST, totalGST: totals.totalGST,
          grandTotal: totals.grandTotal, roundOff: totals.roundOff,
          paymentStatus: payStatus, status: 'issued',
          ...(paid > 0 ? { paymentDate: existing.date } : {}),
        },
      });

      // Stock movements
      for (const item of rawItems) {
        if (!item.productId) continue;
        await tx.stockLedger.create({
          data: {
            productId: item.productId, date: existing.date, movementType: 'sale',
            quantity: -Number(item.quantity), referenceId: existing.id, referenceNo: invNo,
          },
        });
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: { decrement: Number(item.quantity) } },
        });
      }

      // Ledger
      if (existing.customerId) {
        await postSaleInvoice(tx, {
          customerId: existing.customerId, customerName: existing.customerName,
          date: existing.date, invoiceId: existing.id, invoiceNo: invNo, amount: totals.grandTotal,
        });
        if (paid > 0) {
          await postPaymentIn(tx, {
            customerId: existing.customerId, customerName: existing.customerName,
            date: existing.date, amount: paid, method: existing.paymentMethod,
            referenceId: existing.id, referenceNo: invNo,
            narration: `Payment received against ${invNo} (${existing.paymentMethod})`,
          });
        }
        await tx.customer.update({
          where: { id: existing.customerId },
          data: { balance: { increment: totals.grandTotal - paid } },
        });
      }

      return inv;
    });

    res.json(issued);
  } catch (err) { next(err); }
});

// ── RECORD PAYMENT ───────────────────────────────────────────────────────────
router.post('/:id/payment', async (req, res, next) => {
  try {
    const { amount, method, date, narration } = req.body;
    const inv = await prisma.saleInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
    const amt = Number(amount);
    const newPaid = Number(inv.amountPaid) + amt;
    const newStatus = newPaid >= Number(inv.grandTotal) - 0.01 ? 'paid' : 'partial';

    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.saleInvoice.update({
        where: { id: req.params.id },
        data: { amountPaid: newPaid, paymentStatus: newStatus, paymentMethod: method, paymentDate: date },
      });
      if (inv.customerId) {
        await postPaymentIn(tx, {
          customerId: inv.customerId, customerName: inv.customerName,
          date, amount: amt, method, referenceId: inv.id, referenceNo: inv.invoiceNumber, narration,
        });
        await tx.customer.update({
          where: { id: inv.customerId },
          data: { balance: { decrement: amt } },
        });
      }
      return upd;
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// ── MARK PAID ────────────────────────────────────────────────────────────────
router.patch('/:id/mark-paid', async (req, res, next) => {
  try {
    const inv = await prisma.saleInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
    const remaining = Number(inv.grandTotal) - Number(inv.amountPaid);
    const today = new Date().toISOString().slice(0, 10);

    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.saleInvoice.update({
        where: { id: req.params.id },
        data: { paymentStatus: 'paid', amountPaid: Number(inv.grandTotal), status: 'paid', paymentDate: today },
      });
      if (remaining > 0.01 && inv.customerId) {
        await postPaymentIn(tx, {
          customerId: inv.customerId, customerName: inv.customerName,
          date: today, amount: remaining, method: inv.paymentMethod,
          referenceId: inv.id, referenceNo: inv.invoiceNumber,
          narration: `Full payment — ${inv.invoiceNumber}`,
        });
        await tx.customer.update({ where: { id: inv.customerId }, data: { balance: { decrement: remaining } } });
      }
      return upd;
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// ── VOID ─────────────────────────────────────────────────────────────────────
router.patch('/:id/void', async (req, res, next) => {
  try {
    const inv = await prisma.saleInvoice.update({ where: { id: req.params.id }, data: { status: 'void' } });
    res.json(inv);
  } catch (err) { next(err); }
});

// ── SALE RETURN ──────────────────────────────────────────────────────────────
router.post('/:id/return', async (req, res, next) => {
  try {
    const { amount, date, narration } = req.body;
    const inv = await prisma.saleInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
    if (inv.customerId) {
      await prisma.$transaction(async (tx) => {
        await postSaleReturn(tx, {
          customerId: inv.customerId!, customerName: inv.customerName,
          date, amount: Number(amount), referenceId: inv.id, referenceNo: inv.invoiceNumber, narration,
        });
        await tx.customer.update({ where: { id: inv.customerId! }, data: { balance: { decrement: Number(amount) } } });
      });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
