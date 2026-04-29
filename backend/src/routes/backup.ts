import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAdmin } from '../middleware/auth';

const router = Router();
router.use(requireAdmin);

// GET /api/backup — full data export (admin only)
router.get('/', async (_req, res, next) => {
  try {
    const [
      users, customers, suppliers, products,
      saleInvoices, purchaseInvoices, ledgerEntries,
      stockLedger, saleReturns, purchaseReturns,
      quotations, leads, productionEntries,
      reminderLogs, settings, counters, activityLogs,
    ] = await Promise.all([
      prisma.user.findMany(),
      prisma.customer.findMany(),
      prisma.supplier.findMany(),
      prisma.product.findMany(),
      prisma.saleInvoice.findMany(),
      prisma.purchaseInvoice.findMany(),
      prisma.ledgerEntry.findMany(),
      prisma.stockLedger.findMany(),
      prisma.saleReturn.findMany(),
      prisma.purchaseReturn.findMany(),
      prisma.quotation.findMany(),
      prisma.lead.findMany(),
      prisma.productionEntry.findMany(),
      prisma.reminderLog.findMany(),
      prisma.settings.findMany(),
      prisma.counter.findMany(),
      prisma.activityLog.findMany(),
    ]);

    // Strip passwords from users
    const safeUsers = users.map(({ password: _, ...u }) => u);

    res.json({
      exportedAt: new Date().toISOString(),
      version: 1,
      tables: {
        users: safeUsers,
        customers,
        suppliers,
        products,
        saleInvoices,
        purchaseInvoices,
        ledgerEntries,
        stockLedger,
        saleReturns,
        purchaseReturns,
        quotations,
        leads,
        productionEntries,
        reminderLogs,
        settings,
        counters,
        activityLogs,
      },
    });
  } catch (err) { next(err); }
});

export default router;
