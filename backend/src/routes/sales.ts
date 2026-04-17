import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { nextSaleInvoiceNumber } from '../services/counters';
import { buildInvoiceTotals } from '../services/invoiceTotals';
import { postSaleInvoice, postPaymentIn, postSaleReturn } from '../services/ledgerService';

const router = Router();

// Parse JSON string fields from SQLite back to objects/arrays
function parseItems(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}
function parseSettings(raw: any): any {
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

// Pick only the schema fields from the request body — ignores unknown frontend fields (e.g. totalTaxable)
function pickSaleData(b: any) {
  return {
    ...(b.date          !== undefined && { date:          b.date }),
    ...(b.dueDate       !== undefined && { dueDate:       b.dueDate }),
    ...(b.customerId    !== undefined && { customerId:    b.customerId    || null }),
    ...(b.customerName    !== undefined && { customerName:    b.customerName }),
    ...(b.customerPlace   !== undefined && { customerPlace:   b.customerPlace }),
    ...(b.customerType    !== undefined && { customerType:    b.customerType }),
    ...(b.customerAddress !== undefined && { customerAddress: b.customerAddress }),
    ...(b.customerGstin   !== undefined && { customerGstin:   b.customerGstin }),
    ...(b.items         !== undefined && { items:         Array.isArray(b.items) ? JSON.stringify(b.items) : b.items }),
    ...(b.subtotal      !== undefined && { subtotal:      b.subtotal }),
    ...(b.totalDiscount !== undefined && { totalDiscount: b.totalDiscount }),
    ...(b.totalCGST     !== undefined && { totalCGST:     b.totalCGST }),
    ...(b.totalSGST     !== undefined && { totalSGST:     b.totalSGST }),
    ...(b.totalIGST     !== undefined && { totalIGST:     b.totalIGST }),
    ...(b.totalGST      !== undefined && { totalGST:      b.totalGST }),
    ...(b.grandTotal    !== undefined && { grandTotal:    b.grandTotal }),
    ...(b.roundOff      !== undefined && { roundOff:      b.roundOff }),
    ...(b.amountPaid    !== undefined && { amountPaid:    b.amountPaid }),
    ...(b.paymentMethod !== undefined && { paymentMethod: b.paymentMethod }),
    ...(b.paymentStatus !== undefined && { paymentStatus: b.paymentStatus }),
    ...(b.paymentDate   !== undefined && { paymentDate:   b.paymentDate   || null }),
    ...(b.notes         !== undefined && { notes:         b.notes }),
    ...(b.status        !== undefined && { status:        b.status }),
  };
}

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
    const inv = await prisma.saleInvoice.create({ data: pickSaleData(req.body) });
    res.status(201).json(inv);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const oldInv = await prisma.saleInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
    const inv = await prisma.saleInvoice.update({ where: { id: req.params.id }, data: pickSaleData(req.body) });

    // Sync ledger + customer balance if invoice was already issued
    if (oldInv.status !== 'draft' && inv.customerId) {
      const oldTotal = Number(oldInv.grandTotal) || 0;
      const newTotal = Number(inv.grandTotal) || 0;
      const delta = newTotal - oldTotal;
      if (Math.abs(delta) > 0.001) {
        await prisma.ledgerEntry.updateMany({
          where: { referenceId: inv.id, type: 'sale_invoice' },
          data: { debit: newTotal },
        });
        await prisma.customer.update({
          where: { id: inv.customerId },
          data: { balance: { increment: delta } },
        });
      }
    }

    res.json(inv);
  } catch (err) { next(err); }
});

// ── ISSUE ────────────────────────────────────────────────────────────────────
router.post('/:id/issue', async (req, res, next) => {
  try {
    const existing = await prisma.saleInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
    if (existing.status !== 'draft') return res.status(400).json({ error: 'Only draft invoices can be issued' });

    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    const s = parseSettings(settings?.data);
    const isInterState = s.tax?.intraState === false;
    const prefix = s.invoice?.salePrefix || 'SI';

    const rawItems = parseItems(existing.items);
    const totals = buildInvoiceTotals(rawItems, isInterState);
    const paid = Number(existing.amountPaid);
    const payStatus = paid >= totals.grandTotal - 0.01 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

    const issued = await prisma.$transaction(async (tx) => {
      const invNo = await nextSaleInvoiceNumber(prefix, tx);

      const inv = await tx.saleInvoice.update({
        where: { id: existing.id },
        data: {
          invoiceNumber: invNo,
          items: JSON.stringify(totals.items),
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
    }, { timeout: 30000 });

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
    const inv = await prisma.$transaction(async (tx) => {
      const existing = await tx.saleInvoice.findUniqueOrThrow({ where: { id: req.params.id } });

      // Remove ledger entries and reverse customer balance
      if (existing.status !== 'void' && existing.customerId) {
        await tx.ledgerEntry.deleteMany({ where: { referenceId: existing.id } });
        const netOwed = Number(existing.grandTotal) - Number(existing.amountPaid || 0);
        if (netOwed !== 0) {
          await tx.customer.update({
            where: { id: existing.customerId },
            data: { balance: { decrement: netOwed } },
          });
        }
      }

      return tx.saleInvoice.update({ where: { id: req.params.id }, data: { status: 'void' } });
    });
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

// ── DELETE ────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const inv = await prisma.saleInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
    const items = parseItems(inv.items);

    await prisma.$transaction(async (tx) => {
      // 1. Delete stock ledger entries for this invoice
      await tx.stockLedger.deleteMany({ where: { referenceId: inv.id } });

      // 2. Reverse stock — sale reduces stock, so add it back
      for (const item of items) {
        if (item.productId && Number(item.quantity) > 0) {
          await tx.product.update({
            where: { id: item.productId },
            data: { currentStock: { increment: Number(item.quantity) } },
          });
        }
      }

      // 3. Delete all ledger entries tied to this invoice
      await tx.ledgerEntry.deleteMany({ where: { referenceId: inv.id } });

      // 4. Reverse customer balance (net amount that was outstanding)
      if (inv.customerId) {
        const netOwed = Number(inv.grandTotal) - Number(inv.amountPaid || 0);
        if (netOwed !== 0) {
          await tx.customer.update({
            where: { id: inv.customerId },
            data: { balance: { decrement: netOwed } },
          });
        }
      }

      // 5. Delete the invoice
      await tx.saleInvoice.delete({ where: { id: inv.id } });
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Invoice locking ───────────────────────────────────────────────────────────
const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getUserDisplayName(userId: string): Promise<string> {
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, username: true } });
    return u?.name || u?.username || userId;
  } catch { return userId; }
}

router.post('/:id/lock', async (req, res, next) => {
  try {
    const inv = await prisma.saleInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
    const myId = req.user!.id;
    const myName = await getUserDisplayName(myId);
    // Check if already locked by someone else (and not expired)
    if (inv.lockedBy && inv.lockedBy !== myId && inv.lockedAt) {
      const age = Date.now() - new Date(inv.lockedAt).getTime();
      if (age < LOCK_TTL_MS) {
        const lockerName = await getUserDisplayName(inv.lockedBy);
        return res.status(423).json({ error: `Being edited by ${lockerName}`, lockedBy: lockerName });
      }
    }
    await prisma.saleInvoice.update({
      where: { id: req.params.id },
      data: { lockedBy: myId, lockedAt: new Date().toISOString() },
    });
    res.json({ ok: true, lockedBy: myName });
  } catch (err) { next(err); }
});

router.delete('/:id/lock', async (req, res, next) => {
  try {
    const myId = req.user!.id;
    const inv = await prisma.saleInvoice.findUnique({ where: { id: req.params.id } });
    // Only release if you own the lock
    if (inv?.lockedBy === myId) {
      await prisma.saleInvoice.update({ where: { id: req.params.id }, data: { lockedBy: null, lockedAt: null } });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
