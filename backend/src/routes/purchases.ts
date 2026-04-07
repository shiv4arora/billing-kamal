import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { nextPurchaseInvoiceNumber, allocateSkuNumbers } from '../services/counters';
import { buildInvoiceTotals } from '../services/invoiceTotals';
import { postPurchaseInvoice, postPaymentOut, postPurchaseReturn } from '../services/ledgerService';

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

// Pick only schema fields — ignores unknown frontend fields (e.g. totalTaxable)
function pickPurchaseData(b: any) {
  return {
    ...(b.date                  !== undefined && { date:                  b.date }),
    ...(b.dueDate               !== undefined && { dueDate:               b.dueDate }),
    ...(b.supplierId            !== undefined && { supplierId:            b.supplierId            || null }),
    ...(b.supplierName          !== undefined && { supplierName:          b.supplierName }),
    ...(b.supplierInvoiceNumber !== undefined && { supplierInvoiceNumber: b.supplierInvoiceNumber }),
    ...(b.items                 !== undefined && { items:                 Array.isArray(b.items) ? JSON.stringify(b.items) : b.items }),
    ...(b.subtotal              !== undefined && { subtotal:              b.subtotal }),
    ...(b.totalDiscount         !== undefined && { totalDiscount:         b.totalDiscount }),
    ...(b.totalCGST             !== undefined && { totalCGST:             b.totalCGST }),
    ...(b.totalSGST             !== undefined && { totalSGST:             b.totalSGST }),
    ...(b.totalIGST             !== undefined && { totalIGST:             b.totalIGST }),
    ...(b.totalGST              !== undefined && { totalGST:              b.totalGST }),
    ...(b.grandTotal            !== undefined && { grandTotal:            b.grandTotal }),
    ...(b.roundOff              !== undefined && { roundOff:              b.roundOff }),
    ...(b.amountPaid            !== undefined && { amountPaid:            b.amountPaid }),
    ...(b.paymentMethod         !== undefined && { paymentMethod:         b.paymentMethod }),
    ...(b.paymentStatus         !== undefined && { paymentStatus:         b.paymentStatus }),
    ...(b.notes                 !== undefined && { notes:                 b.notes }),
    ...(b.status                !== undefined && { status:                b.status }),
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { status, supplierId, from, to } = req.query as any;
    const where: any = {};
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;
    if (from || to) { where.date = {}; if (from) where.date.gte = from; if (to) where.date.lte = to; }
    const invoices = await prisma.purchaseInvoice.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(invoices);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const inv = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
    res.json(inv);
  } catch (err) { next(err); }
});

// Shared logic: issue a purchase invoice (assign number, update stock, post ledger)
async function issuePurchase(invoiceId: string) {
  const existing = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: invoiceId } });

  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
  const s = parseSettings(settings?.data);
  const isInterState = s.tax?.intraState === false;
  const prefix = s.invoice?.purchasePrefix || 'PI';

  const rawItems = parseItems(existing.items);
  const totals = buildInvoiceTotals(rawItems, isInterState);
  const paid = Number(existing.amountPaid);
  const payStatus = paid >= totals.grandTotal - 0.01 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

  return prisma.$transaction(async (tx) => {
    const invNo = await nextPurchaseInvoiceNumber(prefix, tx);

    // Resolve productIds first so we can store finalised items (isNew: false)
    const resolvedIds: string[] = [];

    for (const item of rawItems) {
      if (!item.productId && !item.isNew) { resolvedIds.push(''); continue; }

      let productId = item.productId;

      // Create new product if flagged
      if (item.isNew || !productId) {
        const sku = item.sku || String(await allocateSkuNumbers(1, tx));
        const newProd = await tx.product.create({
          data: {
            sku, name: item.productName, unit: item.unit || 'Pcs',
            gstRate: item.gstRate || 0, hsnCode: item.hsnCode || '',
            category: item.category || '',
            pricing: JSON.stringify({ wholesale: item.pricing?.wholesale || 0, shop: item.pricing?.shop || item.unitPrice || 0 }),
            costPrice: item.unitPrice || 0,
            supplierId: existing.supplierId || null,
            currentStock: 0,
          },
        });
        productId = newProd.id;
      }

      // Update cost price + pricing if product already existed
      if (!item.isNew && productId) {
        const updateData: any = { costPrice: item.unitPrice };
        if (item.pricing?.wholesale || item.pricing?.shop) {
          updateData.pricing = JSON.stringify({ wholesale: item.pricing?.wholesale || 0, shop: item.pricing?.shop || 0 });
        }
        await tx.product.update({ where: { id: productId }, data: updateData });
      }

      // Stock movement
      await tx.stockLedger.create({
        data: {
          productId, date: existing.date, movementType: 'purchase',
          quantity: Number(item.quantity), referenceId: existing.id, referenceNo: invNo,
        },
      });
      await tx.product.update({
        where: { id: productId },
        data: { currentStock: { increment: Number(item.quantity) } },
      });

      resolvedIds.push(productId);
    }

    // Fetch SKUs for newly created products so we can embed them in stored items
    const skuMap: Record<string, string> = {};
    const newIds = resolvedIds.filter(id => id && !rawItems.find(i => i.productId === id));
    if (newIds.length) {
      const prods = await tx.product.findMany({ where: { id: { in: newIds } }, select: { id: true, sku: true } });
      prods.forEach(p => { if (p.sku) skuMap[p.id] = p.sku; });
    }

    // Store finalised items — isNew: false, productId resolved — prevents duplicate creation on edit
    const finalisedItems = totals.items.map((item: any, i: number) => ({
      ...item,
      isNew: false,
      productId: resolvedIds[i] || item.productId || '',
      sku: skuMap[resolvedIds[i]] || item.sku || '',
    }));

    const inv = await tx.purchaseInvoice.update({
      where: { id: existing.id },
      data: {
        invoiceNumber: invNo, items: JSON.stringify(finalisedItems),
        subtotal: totals.subtotal, totalDiscount: totals.totalDiscount,
        totalCGST: totals.totalCGST, totalSGST: totals.totalSGST,
        totalIGST: totals.totalIGST, totalGST: totals.totalGST,
        grandTotal: totals.grandTotal, roundOff: totals.roundOff,
        paymentStatus: payStatus, status: 'issued',
      },
    });

    // Supplier ledger
    if (existing.supplierId) {
      await postPurchaseInvoice(tx, {
        supplierId: existing.supplierId, supplierName: existing.supplierName,
        date: existing.date, invoiceId: existing.id, invoiceNo: invNo, amount: totals.grandTotal,
      });
      if (paid > 0) {
        await postPaymentOut(tx, {
          supplierId: existing.supplierId, supplierName: existing.supplierName,
          date: existing.date, amount: paid, method: existing.paymentMethod,
          referenceId: existing.id, referenceNo: invNo,
        });
      }
      await tx.supplier.update({
        where: { id: existing.supplierId },
        data: { balance: { increment: totals.grandTotal - paid } },
      });
    }

    return inv;
  }, { timeout: 30000 });
}

router.post('/', async (req, res, next) => {
  try {
    // Create then immediately issue — stock is added right away
    const draft = await prisma.purchaseInvoice.create({ data: pickPurchaseData(req.body) });
    const issued = await issuePurchase(draft.id);
    res.status(201).json(issued);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const rawItems = parseItems(req.body.items);

    // Load old invoice to compute stock quantity diffs
    const oldInv = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
    const oldItems = parseItems(oldInv.items);

    // Map: productId → old quantity
    const oldQtyMap: Record<string, number> = {};
    for (const oi of oldItems) {
      if (oi.productId) oldQtyMap[oi.productId] = (oldQtyMap[oi.productId] || 0) + Number(oi.quantity || 0);
    }

    const processedItems = await prisma.$transaction(async (tx) => {
      const result = [];
      const newQtyMap: Record<string, number> = {};

      for (const item of rawItems) {
        const out = { ...item };

        if (item.isNew && !item.productId) {
          // Guard: product may already exist (old invoices stored isNew:true without productId)
          const existing = item.productName
            ? await tx.product.findFirst({ where: { name: item.productName } })
            : null;

          if (existing) {
            out.productId = existing.id;
            out.sku = existing.sku || '';
            out.isNew = false;
            const updateData: any = { costPrice: item.unitPrice };
            if (item.pricing?.wholesale != null || item.pricing?.shop != null) {
              updateData.pricing = JSON.stringify({ wholesale: item.pricing?.wholesale || 0, shop: item.pricing?.shop || 0 });
            }
            await tx.product.update({ where: { id: existing.id }, data: updateData });
          } else {
            const sku = String(await allocateSkuNumbers(1, tx));
            const newProd = await tx.product.create({
              data: {
                sku, name: item.productName, unit: item.unit || 'Pcs',
                gstRate: item.gstRate || 0, hsnCode: item.hsnCode || '',
                category: item.category || '',
                pricing: JSON.stringify({ wholesale: item.pricing?.wholesale || 0, shop: item.pricing?.shop || item.unitPrice || 0 }),
                costPrice: item.unitPrice || 0,
                supplierId: req.body.supplierId || null,
                currentStock: 0,
              },
            });
            out.productId = newProd.id;
            out.sku = sku;
            out.isNew = false;
          }
        } else if (!item.isNew && item.productId) {
          const updateData: any = { costPrice: item.unitPrice };
          if (item.pricing?.wholesale != null || item.pricing?.shop != null) {
            updateData.pricing = JSON.stringify({ wholesale: item.pricing?.wholesale || 0, shop: item.pricing?.shop || 0 });
          }
          await tx.product.update({ where: { id: item.productId }, data: updateData });
        }

        // Accumulate new quantities per product
        if (out.productId) {
          newQtyMap[out.productId] = (newQtyMap[out.productId] || 0) + Number(item.quantity || 0);
        }

        result.push(out);
      }

      // Apply stock quantity diffs (handles adds, changes, and removals)
      const allIds = new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)]);
      for (const productId of allIds) {
        const diff = (newQtyMap[productId] || 0) - (oldQtyMap[productId] || 0);
        if (diff !== 0) {
          await tx.product.update({ where: { id: productId }, data: { currentStock: { increment: diff } } });
        }
      }

      return result;
    });

    const body = { ...req.body, items: processedItems };
    const inv = await prisma.purchaseInvoice.update({
      where: { id: req.params.id },
      data: pickPurchaseData(body),
    });

    res.json(inv);
  } catch (err) { next(err); }
});

// ── ISSUE (kept for manual use / backward compatibility) ─────────────────────
router.post('/:id/issue', async (req, res, next) => {
  try {
    const existing = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
    if (existing.status !== 'draft') return res.status(400).json({ error: 'Only draft invoices can be issued' });
    const issued = await issuePurchase(existing.id);
    res.json(issued);
  } catch (err) { next(err); }
});

router.post('/:id/payment', async (req, res, next) => {
  try {
    const { amount, method, date, narration } = req.body;
    const inv = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
    const amt = Number(amount);
    const newPaid = Number(inv.amountPaid) + amt;
    const newStatus = newPaid >= Number(inv.grandTotal) - 0.01 ? 'paid' : 'partial';

    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.purchaseInvoice.update({
        where: { id: req.params.id },
        data: { amountPaid: newPaid, paymentStatus: newStatus, paymentMethod: method },
      });
      if (inv.supplierId) {
        await postPaymentOut(tx, {
          supplierId: inv.supplierId, supplierName: inv.supplierName,
          date, amount: amt, method, referenceId: inv.id, referenceNo: inv.invoiceNumber, narration,
        });
        await tx.supplier.update({ where: { id: inv.supplierId }, data: { balance: { decrement: amt } } });
      }
      return upd;
    });
    res.json(updated);
  } catch (err) { next(err); }
});

router.patch('/:id/mark-paid', async (req, res, next) => {
  try {
    const inv = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
    const remaining = Number(inv.grandTotal) - Number(inv.amountPaid);
    const today = new Date().toISOString().slice(0, 10);
    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.purchaseInvoice.update({
        where: { id: req.params.id },
        data: { paymentStatus: 'paid', amountPaid: Number(inv.grandTotal), status: 'paid' },
      });
      if (remaining > 0.01 && inv.supplierId) {
        await postPaymentOut(tx, {
          supplierId: inv.supplierId, supplierName: inv.supplierName,
          date: today, amount: remaining, method: inv.paymentMethod,
          referenceId: inv.id, referenceNo: inv.invoiceNumber,
        });
        await tx.supplier.update({ where: { id: inv.supplierId }, data: { balance: { decrement: remaining } } });
      }
      return upd;
    });
    res.json(updated);
  } catch (err) { next(err); }
});

router.post('/:id/return', async (req, res, next) => {
  try {
    const { amount, date, narration } = req.body;
    const inv = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
    if (inv.supplierId) {
      await prisma.$transaction(async (tx) => {
        await postPurchaseReturn(tx, {
          supplierId: inv.supplierId!, supplierName: inv.supplierName,
          date, amount: Number(amount), referenceId: inv.id, referenceNo: inv.invoiceNumber, narration,
        });
        await tx.supplier.update({ where: { id: inv.supplierId! }, data: { balance: { decrement: Number(amount) } } });
      });
    }
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
    const inv = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: req.params.id } });
    const myId = req.user!.id;
    const myName = await getUserDisplayName(myId);
    if (inv.lockedBy && inv.lockedBy !== myId && inv.lockedAt) {
      const age = Date.now() - new Date(inv.lockedAt).getTime();
      if (age < LOCK_TTL_MS) {
        const lockerName = await getUserDisplayName(inv.lockedBy);
        return res.status(423).json({ error: `Being edited by ${lockerName}`, lockedBy: lockerName });
      }
    }
    await prisma.purchaseInvoice.update({
      where: { id: req.params.id },
      data: { lockedBy: myId, lockedAt: new Date().toISOString() },
    });
    res.json({ ok: true, lockedBy: myName });
  } catch (err) { next(err); }
});

router.delete('/:id/lock', async (req, res, next) => {
  try {
    const myId = req.user!.id;
    const inv = await prisma.purchaseInvoice.findUnique({ where: { id: req.params.id } });
    if (inv?.lockedBy === myId) {
      await prisma.purchaseInvoice.update({ where: { id: req.params.id }, data: { lockedBy: null, lockedAt: null } });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
