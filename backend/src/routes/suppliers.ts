import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// Parse margin JSON string → object before sending to frontend
function parseSupplier(s: any) {
  return {
    ...s,
    margin: (() => { try { return typeof s.margin === 'string' ? JSON.parse(s.margin) : (s.margin || {}); } catch { return {}; } })(),
  };
}

// Serialize margin object → JSON string before storing in SQLite
function serializeMargin(body: any) {
  const margin = body.margin;
  if (margin && typeof margin === 'object') {
    return { ...body, margin: JSON.stringify(margin) };
  }
  return body;
}

router.get('/', async (_req, res, next) => {
  try {
    const suppliers = await prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    res.json(suppliers.map(parseSupplier));
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const s = await prisma.supplier.findUniqueOrThrow({ where: { id: req.params.id } });
    res.json(parseSupplier(s));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const s = await prisma.supplier.create({ data: { ...serializeMargin(req.body), balance: 0 } });
    res.status(201).json(parseSupplier(s));
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { balance, ...rest } = serializeMargin(req.body);
    const s = await prisma.supplier.update({ where: { id: req.params.id }, data: rest });
    res.json(parseSupplier(s));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.supplier.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
