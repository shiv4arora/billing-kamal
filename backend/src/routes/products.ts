import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { supplier: { select: { id: true, name: true, place: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(products);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const p = await prisma.product.findUniqueOrThrow({ where: { id: req.params.id } });
    res.json(p);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    // SKU is never assigned on direct product creation — only assigned when a purchase is completed
    const { sku: _ignored, ...rest } = req.body;
    const p = await prisma.product.create({ data: { ...rest, sku: null } });
    res.status(201).json(p);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const p = await prisma.product.update({ where: { id: req.params.id }, data: req.body });
    res.json(p);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.product.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Manual stock adjustment
router.patch('/:id/stock', async (req, res, next) => {
  try {
    const { delta, date, movementType, referenceId, referenceNo } = req.body;
    const [product, entry] = await prisma.$transaction([
      prisma.product.update({
        where: { id: req.params.id },
        data: { currentStock: { increment: Number(delta) } },
      }),
      prisma.stockLedger.create({
        data: {
          productId: req.params.id, date: date || new Date().toISOString().slice(0, 10),
          movementType: movementType || 'adjustment', quantity: Number(delta),
          referenceId: referenceId || '', referenceNo: referenceNo || '',
        },
      }),
    ]);
    res.json({ product, entry });
  } catch (err) { next(err); }
});

export default router;
