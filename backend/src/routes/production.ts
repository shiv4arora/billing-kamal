import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { allocateSkuNumbers } from '../services/counters';

const router = Router();

/* ── helpers ── */
async function nextProductionNumber(tx: any): Promise<string> {
  const row = await tx.counter.findUnique({ where: { key: 'production' } });
  if (!row) throw new Error("Counter 'production' not found");
  const n = row.value;
  await tx.counter.update({ where: { key: 'production' }, data: { value: n + 1 } });
  return `PRD-${String(n).padStart(4, '0')}`;
}

/* ── GET /production — list newest first ── */
router.get('/', async (_req, res, next) => {
  try {
    const entries = await prisma.productionEntry.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(entries.map(e => ({
      ...e,
      components: (() => { try { return JSON.parse(e.components); } catch { return []; } })(),
    })));
  } catch (err) { next(err); }
});

/* ── POST /production — create entry and move stock atomically ── */
router.post('/', async (req, res, next) => {
  try {
    const {
      date,
      components,       // [{productId, productName, sku, quantity}]
      outputProductId,
      outputProductName,
      outputIsNew,
      outputQuantity,
      outputPricing,    // {wholesale, shop}
      outputUnit,
      notes,
    } = req.body;

    if (!components?.length) return res.status(400).json({ error: 'Add at least one component' });
    if (!outputQuantity || outputQuantity <= 0) return res.status(400).json({ error: 'Output quantity required' });
    if (outputIsNew && !outputProductName?.trim()) return res.status(400).json({ error: 'Output product name required' });
    if (!outputIsNew && !outputProductId) return res.status(400).json({ error: 'Select an output product' });

    const entry = await prisma.$transaction(async (tx) => {
      const entryNumber = await nextProductionNumber(tx);
      const today = date || new Date().toISOString().slice(0, 10);

      /* 1. Deduct each component from stock */
      const resolvedComponents: any[] = [];
      for (const comp of components) {
        const prod = await tx.product.findUnique({ where: { id: comp.productId } });
        if (!prod) throw new Error(`Product not found: ${comp.productId}`);
        const qty = Number(comp.quantity);
        if (prod.currentStock < qty) {
          throw new Error(`Insufficient stock for "${prod.name}" — have ${prod.currentStock}, need ${qty}`);
        }
        await tx.product.update({
          where: { id: comp.productId },
          data: { currentStock: { decrement: qty } },
        });
        await tx.stockLedger.create({
          data: {
            productId: comp.productId,
            date: today,
            movementType: 'production_out',
            quantity: -qty,
            referenceId: '',
            referenceNo: entryNumber,
          },
        });
        resolvedComponents.push({
          productId: comp.productId,
          productName: prod.name,
          sku: prod.sku || '',
          quantity: qty,
        });
      }

      /* 2. Create or update the output product */
      let finalOutputId = outputProductId;
      let finalOutputName = outputProductName || '';

      if (outputIsNew) {
        const sku = String(await allocateSkuNumbers(1, tx));
        const pricing = JSON.stringify({
          wholesale: Number(outputPricing?.wholesale) || 0,
          shop: Number(outputPricing?.shop) || 0,
        });
        const newProd = await tx.product.create({
          data: {
            sku,
            name: outputProductName.trim(),
            unit: outputUnit || 'Pcs',
            gstRate: 0,
            pricing,
            costPrice: 0,
            currentStock: Number(outputQuantity),
            isActive: true,
          },
        });
        // StockLedger for the new product's initial stock via production
        await tx.stockLedger.create({
          data: {
            productId: newProd.id,
            date: today,
            movementType: 'production_in',
            quantity: Number(outputQuantity),
            referenceId: '',
            referenceNo: entryNumber,
          },
        });
        finalOutputId = newProd.id;
        finalOutputName = newProd.name;
      } else {
        // Update pricing if provided
        if (outputPricing) {
          const pricing = JSON.stringify({
            wholesale: Number(outputPricing.wholesale) || 0,
            shop: Number(outputPricing.shop) || 0,
          });
          await tx.product.update({
            where: { id: outputProductId },
            data: { pricing },
          });
        }
        await tx.product.update({
          where: { id: outputProductId },
          data: { currentStock: { increment: Number(outputQuantity) } },
        });
        await tx.stockLedger.create({
          data: {
            productId: outputProductId,
            date: today,
            movementType: 'production_in',
            quantity: Number(outputQuantity),
            referenceId: '',
            referenceNo: entryNumber,
          },
        });
        const prod = await tx.product.findUnique({ where: { id: outputProductId } });
        finalOutputName = prod?.name || outputProductName || '';
      }

      /* 3. Create production entry record */
      return tx.productionEntry.create({
        data: {
          entryNumber,
          date: today,
          components: JSON.stringify(resolvedComponents),
          outputProductId: finalOutputId,
          outputProductName: finalOutputName,
          outputQuantity: Number(outputQuantity),
          notes: notes || '',
        },
      });
    });

    res.json({
      ...entry,
      components: (() => { try { return JSON.parse(entry.components); } catch { return []; } })(),
    });
  } catch (err: any) {
    if (err.message?.startsWith('Insufficient stock')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

export default router;
