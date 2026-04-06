import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    res.json(customers);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: req.params.id } });
    res.json(c);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const c = await prisma.customer.create({ data: { ...req.body, balance: 0 } });
    res.status(201).json(c);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { balance, ...rest } = req.body; // don't let clients overwrite balance directly
    const c = await prisma.customer.update({ where: { id: req.params.id }, data: rest });
    res.json(c);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.customer.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
