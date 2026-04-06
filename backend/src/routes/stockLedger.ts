import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { productId, from, to } = req.query as any;
    const where: any = {};
    if (productId) where.productId = productId;
    if (from || to) { where.date = {}; if (from) where.date.gte = from; if (to) where.date.lte = to; }
    const entries = await prisma.stockLedger.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
    res.json(entries);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const entry = await prisma.stockLedger.create({ data: req.body });
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

export default router;
