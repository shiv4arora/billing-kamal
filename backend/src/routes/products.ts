import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { allocateSkuNumbers } from '../services/counters';

const router = Router();

// Parse pricing JSON string → object before sending to frontend
function parseProduct(p: any) {
  return {
    ...p,
    pricing: (() => { try { return typeof p.pricing === 'string' ? JSON.parse(p.pricing) : (p.pricing || {}); } catch { return {}; } })(),
  };
}

// Serialize pricing object → JSON string before storing in SQLite
function serializePricing(body: any) {
  const pricing = body.pricing;
  if (pricing && typeof pricing === 'object') {
    return { ...body, pricing: JSON.stringify(pricing) };
  }
  return body;
}

router.get('/', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { supplier: { select: { id: true, name: true, place: true, code: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(products.map(parseProduct));
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const p = await prisma.product.findUniqueOrThrow({ where: { id: req.params.id } });
    res.json(parseProduct(p));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    // SKU is never assigned on direct product creation — only assigned when a purchase is completed
    const { sku: _ignored, ...rest } = serializePricing(req.body);
    const p = await prisma.product.create({ data: { ...rest, sku: null } });
    res.status(201).json(parseProduct(p));
  } catch (err) { next(err); }
});

// Batch create products with SKU assignment + opening stock ledger entries
router.post('/batch-opening-stock', async (req, res, next) => {
  try {
    const rows: Array<{ name: string; wholesale?: number; shop?: number; qty?: number; unit?: string; supplierId?: string }> = req.body.items || [];
    const results = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const row of rows) {
        const sku = String(await allocateSkuNumbers(1, tx));
        const qty = Number(row.qty) || 0;
        const product = await tx.product.create({
          data: {
            sku,
            name: row.name,
            unit: row.unit || 'Pcs',
            pricing: JSON.stringify({ wholesale: Number(row.wholesale) || 0, shop: Number(row.shop) || 0 }),
            costPrice: Number(row.costPrice) || 0,
            currentStock: qty,
            ...(row.supplierId ? { supplierId: row.supplierId } : {}),
          },
        });
        if (qty > 0) {
          await tx.stockLedger.create({
            data: {
              productId: product.id,
              date: new Date().toISOString().slice(0, 10),
              movementType: 'adjustment',
              quantity: qty,
              referenceNo: 'Opening Stock',
            },
          });
        }
        created.push(parseProduct(product));
      }
      return created;
    });
    res.status(201).json({ ok: true, created: results });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    // Strip relation objects and read-only fields so Prisma doesn't reject them
    const { id, supplier, createdAt, updatedAt, stockLedger, ...rest } = serializePricing(req.body);
    const p = await prisma.product.update({ where: { id: req.params.id }, data: rest });
    res.json(parseProduct(p));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.product.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// SKU / invoice history for a product
router.get('/:id/history', async (req, res, next) => {
  try {
    const product = await prisma.product.findUniqueOrThrow({ where: { id: req.params.id } });
    const movements = await prisma.stockLedger.findMany({
      where: { productId: req.params.id },
      orderBy: { date: 'asc' },
    });
    res.json({ product: parseProduct(product), movements });
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
    res.json({ product: parseProduct(product), entry });
  } catch (err) { next(err); }
});

export default router;
