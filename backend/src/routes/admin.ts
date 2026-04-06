import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAdmin } from '../middleware/auth';

const router = Router();
router.use(requireAdmin);

// ── EXPORT ────────────────────────────────────────────────────────────────────
router.get('/export', async (_req, res, next) => {
  try {
    const [customers, suppliers, products, saleInvoices, purchaseInvoices,
      ledgerEntries, stockLedger, settings] = await Promise.all([
      prisma.customer.findMany(),
      prisma.supplier.findMany(),
      prisma.product.findMany(),
      prisma.saleInvoice.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.purchaseInvoice.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.ledgerEntry.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.stockLedger.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.settings.findUnique({ where: { id: 'singleton' } }),
    ]);

    res.json({
      exportedAt: new Date().toISOString(),
      customers, suppliers, products,
      saleInvoices, purchaseInvoices,
      ledgerEntries, stockLedger,
      settings: settings?.data || {},
    });
  } catch (err) { next(err); }
});

// ── IMPORT ────────────────────────────────────────────────────────────────────
router.post('/import', async (req, res, next) => {
  try {
    const data = req.body;

    await prisma.$transaction(async (tx) => {
      // Clear existing data
      await tx.reminderLog.deleteMany();
      await tx.stockLedger.deleteMany();
      await tx.ledgerEntry.deleteMany();
      await tx.saleInvoice.deleteMany();
      await tx.purchaseInvoice.deleteMany();
      await tx.product.deleteMany();
      await tx.customer.deleteMany();
      await tx.supplier.deleteMany();

      if (data.customers?.length)       await tx.customer.createMany({ data: data.customers });
      if (data.suppliers?.length)       await tx.supplier.createMany({ data: data.suppliers });
      if (data.products?.length) {
        // pricing stored as JSON string in SQLite
        const prods = data.products.map((p: any) => ({
          ...p,
          pricing: typeof p.pricing === 'string' ? p.pricing : JSON.stringify(p.pricing ?? {}),
        }));
        await tx.product.createMany({ data: prods });
      }
      if (data.saleInvoices?.length) {
        const invs = data.saleInvoices.map((i: any) => ({
          ...i,
          items: typeof i.items === 'string' ? i.items : JSON.stringify(i.items ?? []),
        }));
        await tx.saleInvoice.createMany({ data: invs });
      }
      if (data.purchaseInvoices?.length) {
        const invs = data.purchaseInvoices.map((i: any) => ({
          ...i,
          items: typeof i.items === 'string' ? i.items : JSON.stringify(i.items ?? []),
        }));
        await tx.purchaseInvoice.createMany({ data: invs });
      }
      if (data.ledgerEntries?.length)   await tx.ledgerEntry.createMany({ data: data.ledgerEntries });
      if (data.stockLedger?.length)     await tx.stockLedger.createMany({ data: data.stockLedger });

      if (data.settings) {
        const settingsStr = typeof data.settings === 'string'
          ? data.settings : JSON.stringify(data.settings);
        await tx.settings.upsert({
          where: { id: 'singleton' },
          update: { data: settingsStr },
          create: { id: 'singleton', data: settingsStr },
        });
      }
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── RESET INVENTORY (one-time use) ───────────────────────────────────────────
router.post('/reset-inventory', async (_req, res, next) => {
  try {
    await prisma.$transaction([
      prisma.stockLedger.deleteMany(),
      prisma.ledgerEntry.deleteMany(),
      prisma.saleInvoice.deleteMany(),
      prisma.purchaseInvoice.deleteMany(),
      prisma.product.deleteMany(),
      prisma.counter.update({ where: { key: 'sku' },             data: { value: 1001 } }),
      prisma.counter.update({ where: { key: 'saleInvoice' },     data: { value: 1 } }),
      prisma.counter.update({ where: { key: 'purchaseInvoice' }, data: { value: 1 } }),
    ]);
    res.json({ ok: true, message: 'All products, invoices and ledger entries deleted. Counters reset.' });
  } catch (err) { next(err); }
});

export default router;
