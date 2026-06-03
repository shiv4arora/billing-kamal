import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { allocateSkuNumbers } from '../services/counters';
import { logActivity } from '../services/activityLogger';

const router = Router();

/* ── helpers ── */
async function nextProductionNumber(tx: any): Promise<string> {
  const row = await tx.counter.findUnique({ where: { key: 'production' } });
  if (!row) throw new Error("Counter 'production' not found");
  const n = row.value;
  await tx.counter.update({ where: { key: 'production' }, data: { value: n + 1 } });
  return `PRD-${String(n).padStart(4, '0')}`;
}

function parseOutputs(entry: any): any[] {
  // Try new outputs field first, fall back to legacy single-output fields
  try {
    const arr = JSON.parse(entry.outputs || '[]');
    if (Array.isArray(arr) && arr.length > 0) return arr;
  } catch {}
  // Legacy: single output
  if (entry.outputProductId) {
    return [{
      productId: entry.outputProductId,
      productName: entry.outputProductName || '',
      sku: '',
      quantity: Number(entry.outputQuantity),
      pricing: { wholesale: 0, shop: 0 },
    }];
  }
  return [];
}

function parseComponents(entry: any): any[] {
  try { return JSON.parse(entry.components); } catch { return []; }
}

/* ── GET /production ── */
router.get('/', async (_req, res, next) => {
  try {
    const entries = await prisma.productionEntry.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(entries.map(e => ({
      ...e,
      components: parseComponents(e),
      outputs: parseOutputs(e),
    })));
  } catch (err) { next(err); }
});

/* ── POST /production/immediate — create SKU + entry, no components ── */
router.post('/immediate', async (req, res, next) => {
  try {
    const { name, wholesale, shop, unit, qty, supplierId, date } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Product name is required' });

    const entry = await prisma.$transaction(async (tx) => {
      const entryNumber = await nextProductionNumber(tx);
      const today = date || new Date().toISOString().slice(0, 10);
      const sku = String(await allocateSkuNumbers(1, tx));
      const pricing = { wholesale: Number(wholesale) || 0, shop: Number(shop) || 0 };
      const quantity = Number(qty) || 0;

      const product = await tx.product.create({
        data: {
          sku,
          name: name.trim(),
          unit: unit || 'Pcs',
          gstRate: 0,
          pricing: JSON.stringify(pricing),
          costPrice: 0,
          currentStock: quantity,
          isActive: true,
          ...(supplierId ? { supplierId } : {}),
        },
      });

      if (quantity > 0) {
        await tx.stockLedger.create({
          data: { productId: product.id, date: today, movementType: 'production_in', quantity, referenceId: '', referenceNo: entryNumber },
        });
      }

      const output = { productId: product.id, productName: product.name, sku: product.sku, quantity, pricing, unit: product.unit };

      return tx.productionEntry.create({
        data: {
          entryNumber, date: today,
          components: JSON.stringify([]),
          outputs: JSON.stringify([output]),
          outputProductId: product.id,
          outputProductName: product.name,
          outputQuantity: quantity,
          notes: '', box: '',
          isImmediate: true,
        },
      });
    });

    logActivity({
      userId: (req as any).user?.id, userName: (req as any).user?.name || (req as any).user?.username,
      action: 'CREATE', entity: 'Production',
      entityId: entry.id, entityRef: entry.entryNumber,
      details: `[Immediate] ${entry.outputProductName}`,
    });

    res.json({ ...entry, components: [], outputs: parseOutputs(entry) });
  } catch (err) { next(err); }
});

/* ── POST /production ── */
router.post('/', async (req, res, next) => {
  try {
    const { date, components, outputs, notes, box } = req.body;
    // outputs: [{productId?, productName, isNew, unit, quantity, pricing:{wholesale,shop}}]

    if (!components?.length) return res.status(400).json({ error: 'Add at least one component' });
    if (!outputs?.length) return res.status(400).json({ error: 'Add at least one finished product' });
    for (const o of outputs) {
      if (!o.quantity || Number(o.quantity) <= 0) return res.status(400).json({ error: 'Enter quantity for all outputs' });
      if (o.isNew && !o.productName?.trim()) return res.status(400).json({ error: 'Enter name for new output product' });
      if (!o.isNew && !o.productId) return res.status(400).json({ error: 'Select all output products' });
    }

    const entry = await prisma.$transaction(async (tx) => {
      const entryNumber = await nextProductionNumber(tx);
      const today = date || new Date().toISOString().slice(0, 10);

      /* 1. Deduct each component */
      const resolvedComponents: any[] = [];
      for (const comp of components) {
        const prod = await tx.product.findUnique({ where: { id: comp.productId } });
        if (!prod) throw new Error(`Product not found: ${comp.productId}`);
        const qty = Number(comp.quantity);
        if (prod.currentStock < qty) throw new Error(`Insufficient stock for "${prod.name}" — have ${prod.currentStock}, need ${qty}`);
        await tx.product.update({ where: { id: comp.productId }, data: { currentStock: { decrement: qty } } });
        await tx.stockLedger.create({ data: { productId: comp.productId, date: today, movementType: 'production_out', quantity: -qty, referenceId: '', referenceNo: entryNumber } });
        resolvedComponents.push({ productId: comp.productId, productName: prod.name, sku: prod.sku || '', quantity: qty });
      }

      /* 2. Process each output */
      const resolvedOutputs: any[] = [];
      for (const out of outputs) {
        const qty = Number(out.quantity);
        const pricing = { wholesale: Number(out.pricing?.wholesale) || 0, shop: Number(out.pricing?.shop) || 0 };

        let productId = out.productId;
        let productName = out.productName;
        let sku = out.sku || '';

        let unit = out.unit || 'Pcs';
        if (out.isNew) {
          const skuStr = String(await allocateSkuNumbers(1, tx));
          const newProd = await tx.product.create({
            data: {
              sku: skuStr, name: out.productName.trim(), unit,
              gstRate: 0, pricing: JSON.stringify(pricing), costPrice: 0,
              currentStock: qty, isActive: true,
              ...(out.supplierId ? { supplierId: out.supplierId } : {}),
            },
          });
          productId = newProd.id;
          productName = newProd.name;
          sku = newProd.sku || skuStr;
          unit = newProd.unit;
          await tx.stockLedger.create({ data: { productId, date: today, movementType: 'production_in', quantity: qty, referenceId: '', referenceNo: entryNumber } });
        } else {
          if (pricing.wholesale || pricing.shop) {
            await tx.product.update({ where: { id: productId }, data: { pricing: JSON.stringify(pricing) } });
          }
          await tx.product.update({ where: { id: productId }, data: { currentStock: { increment: qty } } });
          await tx.stockLedger.create({ data: { productId, date: today, movementType: 'production_in', quantity: qty, referenceId: '', referenceNo: entryNumber } });
          const prod = await tx.product.findUnique({ where: { id: productId } });
          productName = prod?.name || productName;
          sku = prod?.sku || sku;
          unit = prod?.unit || unit;
        }

        resolvedOutputs.push({ productId, productName, sku, quantity: qty, pricing, unit });
      }

      const firstOut = resolvedOutputs[0];
      return tx.productionEntry.create({
        data: {
          entryNumber, date: today,
          components: JSON.stringify(resolvedComponents),
          outputs: JSON.stringify(resolvedOutputs),
          outputProductId: firstOut.productId,
          outputProductName: firstOut.productName,
          outputQuantity: firstOut.quantity,
          notes: notes || '',
          box: box || '',
        },
      });
    });

    const outNames = parseOutputs(entry).map((o: any) => `${o.productName} ×${o.quantity}`).join(', ');
    logActivity({
      userId: req.user?.id, userName: req.user?.name || req.user?.username,
      action: 'CREATE', entity: 'Production',
      entityId: entry.id, entityRef: entry.entryNumber,
      details: outNames,
    });
    res.json({ ...entry, components: parseComponents(entry), outputs: parseOutputs(entry) });
  } catch (err: any) {
    if (err.message?.startsWith('Insufficient stock')) return res.status(400).json({ error: err.message });
    next(err);
  }
});

/* ── GET /production/:id ── */
router.get('/:id', async (req, res, next) => {
  try {
    const entry = await prisma.productionEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) return res.status(404).json({ error: 'Not found' });
    res.json({ ...entry, components: parseComponents(entry), outputs: parseOutputs(entry) });
  } catch (err) { next(err); }
});

/* ── PUT /production/:id ── */
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.productionEntry.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { date, components, outputs, notes, box } = req.body;
    const oldComponents: any[] = parseComponents(existing);
    const newComponents: any[] = components || [];
    const oldOutputs: any[] = parseOutputs(existing);
    const newOutputs: any[] = outputs || [];

    const updated = await prisma.$transaction(async (tx) => {
      const today = date || existing.date;

      /* ── Component deltas ── */
      const oldCompMap: Record<string, number> = {};
      for (const c of oldComponents) oldCompMap[c.productId] = Number(c.quantity);
      const newCompMap: Record<string, number> = {};
      for (const c of newComponents) newCompMap[c.productId] = Number(c.quantity);
      const allCompIds = new Set([...Object.keys(oldCompMap), ...Object.keys(newCompMap)]);

      for (const productId of allCompIds) {
        const oldQty = oldCompMap[productId] || 0;
        const newQty = newCompMap[productId] || 0;
        const delta = newQty - oldQty;
        if (delta === 0) continue;
        if (delta > 0) {
          const prod = await tx.product.findUnique({ where: { id: productId } });
          if (!prod) throw new Error(`Product not found: ${productId}`);
          if (prod.currentStock < delta) throw new Error(`Insufficient stock for "${prod.name}" — have ${prod.currentStock}, need ${delta} more`);
        }
        await tx.product.update({ where: { id: productId }, data: { currentStock: { decrement: delta } } });
        await tx.stockLedger.create({ data: { productId, date: today, movementType: delta > 0 ? 'production_out' : 'production_out_reversal', quantity: -delta, referenceId: existing.id, referenceNo: existing.entryNumber } });
      }

      /* ── Create any new output products first, assign productId ── */
      const resolvedNewOutputs: any[] = [];
      for (const o of newOutputs) {
        if (o.isNew) {
          if (!o.productName?.trim()) throw new Error('Enter name for new output product');
          const qty = Number(o.quantity);
          const pricing = { wholesale: Number(o.pricing?.wholesale) || 0, shop: Number(o.pricing?.shop) || 0 };
          const sku = String(await allocateSkuNumbers(1, tx));
          const newProd = await tx.product.create({
            data: {
              sku, name: o.productName.trim(), unit: o.unit || 'Pcs',
              gstRate: 0, pricing: JSON.stringify(pricing), costPrice: 0,
              currentStock: qty, isActive: true,
              ...(o.supplierId ? { supplierId: o.supplierId } : {}),
            },
          });
          await tx.stockLedger.create({ data: { productId: newProd.id, date: today, movementType: 'production_in', quantity: qty, referenceId: existing.id, referenceNo: existing.entryNumber } });
          resolvedNewOutputs.push({ productId: newProd.id, productName: newProd.name, sku: newProd.sku, quantity: qty, pricing, unit: newProd.unit });
        } else {
          resolvedNewOutputs.push(o);
        }
      }

      /* ── Output deltas (existing products only; new products already have stock added above) ── */
      const isNewProductId = new Set(
        newOutputs.filter((n: any) => n.isNew).map((_: any, idx: number) => resolvedNewOutputs[idx]?.productId).filter(Boolean)
      );
      const oldOutMap: Record<string, number> = {};
      for (const o of oldOutputs) oldOutMap[o.productId] = Number(o.quantity);
      const newOutMap: Record<string, number> = {};
      for (const o of resolvedNewOutputs) {
        if (!isNewProductId.has(o.productId)) newOutMap[o.productId] = Number(o.quantity);
      }
      const allOutIds = new Set([...Object.keys(oldOutMap), ...Object.keys(newOutMap)]);

      for (const productId of allOutIds) {
        const oldQty = oldOutMap[productId] || 0;
        const newQty = newOutMap[productId] || 0;
        const delta = newQty - oldQty;
        if (delta === 0) continue;
        if (delta < 0) {
          const prod = await tx.product.findUnique({ where: { id: productId } });
          if (prod && prod.currentStock + delta < 0) throw new Error(`Cannot reduce output: only ${prod.currentStock} of "${prod.name}" in stock`);
        }
        await tx.product.update({ where: { id: productId }, data: { currentStock: { increment: delta } } });
        await tx.stockLedger.create({ data: { productId, date: today, movementType: delta > 0 ? 'production_in' : 'production_in_reversal', quantity: delta, referenceId: existing.id, referenceNo: existing.entryNumber } });
      }

      /* ── Update pricing for existing outputs ── */
      for (const o of resolvedNewOutputs) {
        if (o.pricing && (o.pricing.wholesale || o.pricing.shop) && o.productId) {
          await tx.product.update({
            where: { id: o.productId },
            data: { pricing: JSON.stringify({ wholesale: Number(o.pricing.wholesale) || 0, shop: Number(o.pricing.shop) || 0 }) },
          });
        }
      }

      /* ── Resolve component names ── */
      const resolvedComponents = await Promise.all(newComponents.map(async (c: any) => {
        const prod = await tx.product.findUnique({ where: { id: c.productId } });
        return { productId: c.productId, productName: prod?.name || c.productName, sku: prod?.sku || c.sku || '', quantity: Number(c.quantity) };
      }));

      /* ── Resolve output names — use submitted name, update product if changed ── */
      const resolvedOutputs = await Promise.all(resolvedNewOutputs.map(async (o: any) => {
        const prod = await tx.product.findUnique({ where: { id: o.productId } });
        const finalName = o.productName?.trim() || prod?.name || '';
        if (prod && finalName && prod.name !== finalName) {
          await tx.product.update({ where: { id: o.productId }, data: { name: finalName } });
        }
        return { productId: o.productId, productName: finalName, sku: prod?.sku || '', quantity: Number(o.quantity), pricing: o.pricing || {}, unit: prod?.unit || o.unit || 'Pcs' };
      }));

      const firstOut = resolvedOutputs[0] || { productId: '', productName: '', quantity: 0 };
      return tx.productionEntry.update({
        where: { id: existing.id },
        data: {
          date: today,
          components: JSON.stringify(resolvedComponents),
          outputs: JSON.stringify(resolvedOutputs),
          outputProductId: firstOut.productId,
          outputProductName: firstOut.productName,
          outputQuantity: firstOut.quantity,
          notes: notes ?? existing.notes,
          box: box ?? existing.box ?? '',
        },
      });
    });

    res.json({ ...updated, components: parseComponents(updated), outputs: parseOutputs(updated) });
  } catch (err: any) {
    if (err.message?.startsWith('Insufficient') || err.message?.startsWith('Cannot reduce') || err.message?.startsWith('Cannot change')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

/* ── DELETE /production/:id ── */
router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.productionEntry.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const components = parseComponents(existing);
    const outputs = parseOutputs(existing);

    await prisma.$transaction(async (tx) => {
      const today = new Date().toISOString().slice(0, 10);

      for (const c of components) {
        const qty = Number(c.quantity);
        await tx.product.update({ where: { id: c.productId }, data: { currentStock: { increment: qty } } });
        await tx.stockLedger.create({ data: { productId: c.productId, date: today, movementType: 'production_out_reversal', quantity: qty, referenceId: existing.id, referenceNo: existing.entryNumber } });
      }

      for (const o of outputs) {
        const qty = Number(o.quantity);
        const prod = await tx.product.findUnique({ where: { id: o.productId } });
        if (prod && prod.currentStock - qty < 0) throw new Error(`Cannot delete: only ${prod.currentStock} of "${prod.name}" in stock`);
        await tx.product.update({ where: { id: o.productId }, data: { currentStock: { decrement: qty } } });
        await tx.stockLedger.create({ data: { productId: o.productId, date: today, movementType: 'production_in_reversal', quantity: -qty, referenceId: existing.id, referenceNo: existing.entryNumber } });
      }

      await tx.productionEntry.delete({ where: { id: existing.id } });
    });

    logActivity({
      userId: req.user?.id, userName: req.user?.name || req.user?.username,
      action: 'DELETE', entity: 'Production',
      entityId: existing.id, entityRef: existing.entryNumber,
      details: existing.outputProductName,
    });
    res.json({ ok: true });
  } catch (err: any) {
    if (err.message?.startsWith('Cannot delete')) return res.status(400).json({ error: err.message });
    next(err);
  }
});

export default router;
