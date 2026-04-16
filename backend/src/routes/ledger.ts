import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// Get all ledger entries for a party with running balance
router.get('/:partyType/:partyId', async (req, res, next) => {
  try {
    const { partyType, partyId } = req.params;
    const entries = await prisma.ledgerEntry.findMany({
      where: { partyType, partyId },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    // Compute running balance
    let running = 0;
    const withBalance = entries.map(e => {
      const dr = Number(e.debit), cr = Number(e.credit);
      if (partyType === 'customer') running += dr - cr;
      else running += cr - dr;
      return { ...e, balance: running };
    });

    const balance = running;
    res.json({ entries: withBalance, balance });
  } catch (err) { next(err); }
});

// Manual payment in (customer)
router.post('/customer/:id/payment', async (req, res, next) => {
  try {
    const { date, amount, method, narration } = req.body;
    const cust = await prisma.customer.findUniqueOrThrow({ where: { id: req.params.id } });
    const entry = await prisma.$transaction(async (tx) => {
      const e = await tx.ledgerEntry.create({
        data: {
          partyType: 'customer', partyId: req.params.id, partyName: cust.name,
          date, type: 'payment_in', debit: 0, credit: Number(amount),
          referenceType: 'payment', referenceId: '', referenceNo: '',
          narration: narration || `Payment received (${method})`,
        },
      });
      await tx.customer.update({ where: { id: req.params.id }, data: { balance: { decrement: Number(amount) } } });
      return e;
    });
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

// Manual sale return (customer)
router.post('/customer/:id/return', async (req, res, next) => {
  try {
    const { date, amount, narration } = req.body;
    const cust = await prisma.customer.findUniqueOrThrow({ where: { id: req.params.id } });
    const entry = await prisma.$transaction(async (tx) => {
      const e = await tx.ledgerEntry.create({
        data: {
          partyType: 'customer', partyId: req.params.id, partyName: cust.name,
          date, type: 'sale_return', debit: 0, credit: Number(amount),
          referenceType: 'sale_return', referenceId: '', referenceNo: '',
          narration: narration || 'Sale Return',
        },
      });
      await tx.customer.update({ where: { id: req.params.id }, data: { balance: { decrement: Number(amount) } } });
      return e;
    });
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

// Manual adjustment
router.post('/customer/:id/adjustment', async (req, res, next) => {
  try {
    const { date, debit, credit, narration } = req.body;
    const cust = await prisma.customer.findUniqueOrThrow({ where: { id: req.params.id } });
    const entry = await prisma.$transaction(async (tx) => {
      const e = await tx.ledgerEntry.create({
        data: {
          partyType: 'customer', partyId: req.params.id, partyName: cust.name,
          date, type: 'adjustment', debit: Number(debit) || 0, credit: Number(credit) || 0,
          referenceType: 'adjustment', referenceId: '', referenceNo: '',
          narration: narration || 'Manual Adjustment',
        },
      });
      const delta = (Number(debit) || 0) - (Number(credit) || 0);
      await tx.customer.update({ where: { id: req.params.id }, data: { balance: { increment: delta } } });
      return e;
    });
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

// Manual payment out (supplier)
router.post('/supplier/:id/payment', async (req, res, next) => {
  try {
    const { date, amount, method, narration } = req.body;
    const supp = await prisma.supplier.findUniqueOrThrow({ where: { id: req.params.id } });
    const entry = await prisma.$transaction(async (tx) => {
      const e = await tx.ledgerEntry.create({
        data: {
          partyType: 'supplier', partyId: req.params.id, partyName: supp.name,
          date, type: 'payment_out', debit: Number(amount), credit: 0,
          referenceType: 'payment', referenceId: '', referenceNo: '',
          narration: narration || `Payment made (${method})`,
        },
      });
      await tx.supplier.update({ where: { id: req.params.id }, data: { balance: { decrement: Number(amount) } } });
      return e;
    });
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

// Manual purchase return (supplier)
router.post('/supplier/:id/return', async (req, res, next) => {
  try {
    const { date, amount, narration } = req.body;
    const supp = await prisma.supplier.findUniqueOrThrow({ where: { id: req.params.id } });
    const entry = await prisma.$transaction(async (tx) => {
      const e = await tx.ledgerEntry.create({
        data: {
          partyType: 'supplier', partyId: req.params.id, partyName: supp.name,
          date, type: 'purchase_return', debit: Number(amount), credit: 0,
          referenceType: 'purchase_return', referenceId: '', referenceNo: '',
          narration: narration || 'Purchase Return',
        },
      });
      await tx.supplier.update({ where: { id: req.params.id }, data: { balance: { decrement: Number(amount) } } });
      return e;
    });
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

router.post('/supplier/:id/adjustment', async (req, res, next) => {
  try {
    const { date, debit, credit, narration } = req.body;
    const supp = await prisma.supplier.findUniqueOrThrow({ where: { id: req.params.id } });
    const entry = await prisma.$transaction(async (tx) => {
      const e = await tx.ledgerEntry.create({
        data: {
          partyType: 'supplier', partyId: req.params.id, partyName: supp.name,
          date, type: 'adjustment', debit: Number(debit) || 0, credit: Number(credit) || 0,
          referenceType: 'adjustment', referenceId: '', referenceNo: '',
          narration: narration || 'Manual Adjustment',
        },
      });
      const delta = (Number(credit) || 0) - (Number(debit) || 0);
      await tx.supplier.update({ where: { id: req.params.id }, data: { balance: { increment: delta } } });
      return e;
    });
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

const EDITABLE_TYPES = ['payment_in', 'payment_out', 'sale_return', 'purchase_return', 'adjustment'];

// Edit a ledger entry (amount, date, narration) — payment/return/adjustment only
router.put('/entry/:id', async (req, res, next) => {
  try {
    const { amount, date, narration } = req.body;
    const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: req.params.id } });

    if (!EDITABLE_TYPES.includes(entry.type)) {
      return res.status(400).json({ error: 'Invoice entries cannot be edited here. Edit the invoice instead.' });
    }

    const newAmount = Number(amount);
    const oldDebit  = Number(entry.debit)  || 0;
    const oldCredit = Number(entry.credit) || 0;

    // Preserve which field (debit or credit) holds the amount for this entry type
    let newDebit  = oldDebit;
    let newCredit = oldCredit;
    if (oldCredit > 0) { newCredit = newAmount; newDebit = 0; }
    else if (oldDebit > 0) { newDebit = newAmount; newCredit = 0; }
    else {
      // both zero (edge case) — infer from party type
      if (entry.partyType === 'customer') newCredit = newAmount;
      else newDebit = newAmount;
    }

    // customer.balance = Σ(debit - credit); supplier.balance = Σ(credit - debit)
    const balanceDelta = entry.partyType === 'customer'
      ? (newDebit - newCredit) - (oldDebit - oldCredit)
      : (newCredit - newDebit) - (oldCredit - oldDebit);

    await prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.update({
        where: { id: req.params.id },
        data: {
          debit: newDebit, credit: newCredit,
          ...(date      && { date }),
          ...(narration && { narration }),
        },
      });
      if (Math.abs(balanceDelta) > 0.001) {
        if (entry.partyType === 'customer') {
          await tx.customer.update({ where: { id: entry.partyId }, data: { balance: { increment: balanceDelta } } });
        } else {
          await tx.supplier.update({ where: { id: entry.partyId }, data: { balance: { increment: balanceDelta } } });
        }
      }
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Delete a ledger entry and reverse its balance effect — payment/return/adjustment only
router.delete('/entry/:id', async (req, res, next) => {
  try {
    const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: req.params.id } });

    if (!EDITABLE_TYPES.includes(entry.type)) {
      return res.status(400).json({ error: 'Invoice entries cannot be deleted here.' });
    }

    const debit  = Number(entry.debit)  || 0;
    const credit = Number(entry.credit) || 0;
    // Reverse the entry's contribution to balance
    const balanceDelta = entry.partyType === 'customer' ? credit - debit : debit - credit;

    await prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.delete({ where: { id: req.params.id } });
      if (Math.abs(balanceDelta) > 0.001) {
        if (entry.partyType === 'customer') {
          await tx.customer.update({ where: { id: entry.partyId }, data: { balance: { increment: balanceDelta } } });
        } else {
          await tx.supplier.update({ where: { id: entry.partyId }, data: { balance: { increment: balanceDelta } } });
        }
      }
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
