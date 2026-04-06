import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const suppliers = await prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    res.json(suppliers);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const s = await prisma.supplier.findUniqueOrThrow({ where: { id: req.params.id } });
    res.json(s);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const s = await prisma.supplier.create({ data: { ...req.body, balance: 0 } });
    res.status(201).json(s);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { balance, ...rest } = req.body;
    const s = await prisma.supplier.update({ where: { id: req.params.id }, data: rest });
    res.json(s);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.supplier.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
