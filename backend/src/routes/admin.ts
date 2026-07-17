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

// ── SYNC / RECONCILE LEDGER ─────────────────────────────────────────────────
// Full reconcile — makes every invoice's ledger entry match reality, then
// rebuilds all party balances from the ledger. Critically it DEDUPES: an invoice
// with two ledger entries (double-posted, inflating the balance) is reduced to
// one. Also: fixes wrong amounts, creates missing entries, and strips ledger
// entries off drafts/deleted invoices.
const LIVE_SALE = ['issued', 'completed', 'paid'];
const LIVE_PURCHASE = ['issued', 'paid', 'completed'];

router.post('/sync-ledger', async (_req, res, next) => {
  try {
    const r = {
      saleDupsRemoved: 0, saleFixed: 0, saleCreated: 0, saleStripped: 0,
      purchaseDupsRemoved: 0, purchaseFixed: 0, purchaseCreated: 0, purchaseStripped: 0,
      customersFixed: 0, suppliersFixed: 0,
    };

    // ── SALES: one sale_invoice entry (= grandTotal) per live invoice ──
    const sales = await prisma.saleInvoice.findMany();
    for (const inv of sales) {
      const live = LIVE_SALE.includes(inv.status) && !!inv.customerId;
      const total = Number(inv.grandTotal) || 0;
      const entries = await prisma.ledgerEntry.findMany({
        where: { referenceId: inv.id, type: 'sale_invoice' }, orderBy: { createdAt: 'asc' },
      });
      if (!live) {
        if (entries.length) {
          const del = await prisma.ledgerEntry.deleteMany({ where: { referenceId: inv.id, type: { in: ['sale_invoice', 'payment_in'] } } });
          r.saleStripped += del.count;
        }
        continue;
      }
      if (entries.length === 0) {
        await prisma.ledgerEntry.create({ data: {
          partyType: 'customer', partyId: inv.customerId!, partyName: inv.customerName,
          date: inv.date, type: 'sale_invoice', debit: total, credit: 0,
          referenceType: 'sale_invoice', referenceId: inv.id, referenceNo: inv.invoiceNumber || '',
          narration: `Sale Invoice ${inv.invoiceNumber || ''}`,
        } });
        r.saleCreated++;
      } else {
        const [keep, ...extras] = entries;
        if (extras.length) {
          await prisma.ledgerEntry.deleteMany({ where: { id: { in: extras.map(e => e.id) } } });
          r.saleDupsRemoved += extras.length;
        }
        if (Math.abs(Number(keep.debit) - total) > 0.01 || keep.partyId !== inv.customerId) {
          await prisma.ledgerEntry.update({ where: { id: keep.id }, data: {
            debit: total, credit: 0, partyId: inv.customerId, partyName: inv.customerName,
            date: inv.date, narration: `Sale Invoice ${inv.invoiceNumber || ''}`,
          } });
          r.saleFixed++;
        }
      }
    }

    // ── PURCHASES: one purchase_invoice entry (= grandTotal) per live invoice ──
    const purchases = await prisma.purchaseInvoice.findMany();
    for (const inv of purchases) {
      const live = LIVE_PURCHASE.includes(inv.status) && !!inv.supplierId;
      const total = Number(inv.grandTotal) || 0;
      const entries = await prisma.ledgerEntry.findMany({
        where: { referenceId: inv.id, type: 'purchase_invoice' }, orderBy: { createdAt: 'asc' },
      });
      if (!live) {
        if (entries.length) {
          const del = await prisma.ledgerEntry.deleteMany({ where: { referenceId: inv.id, type: { in: ['purchase_invoice', 'payment_out'] } } });
          r.purchaseStripped += del.count;
        }
        continue;
      }
      if (entries.length === 0) {
        await prisma.ledgerEntry.create({ data: {
          partyType: 'supplier', partyId: inv.supplierId!, partyName: inv.supplierName,
          date: inv.date, type: 'purchase_invoice', debit: 0, credit: total,
          referenceType: 'purchase_invoice', referenceId: inv.id, referenceNo: inv.invoiceNumber || '',
          narration: `Purchase Invoice ${inv.invoiceNumber || ''}`,
        } });
        r.purchaseCreated++;
      } else {
        const [keep, ...extras] = entries;
        if (extras.length) {
          await prisma.ledgerEntry.deleteMany({ where: { id: { in: extras.map(e => e.id) } } });
          r.purchaseDupsRemoved += extras.length;
        }
        if (Math.abs(Number(keep.credit) - total) > 0.01 || keep.partyId !== inv.supplierId) {
          await prisma.ledgerEntry.update({ where: { id: keep.id }, data: {
            credit: total, debit: 0, partyId: inv.supplierId, partyName: inv.supplierName,
            date: inv.date, narration: `Purchase Invoice ${inv.invoiceNumber || ''}`,
          } });
          r.purchaseFixed++;
        }
      }
    }

    // ── Rebuild every balance from the ledger ──
    const customers = await prisma.customer.findMany({ select: { id: true } });
    for (const c of customers) {
      const rows = await prisma.ledgerEntry.findMany({ where: { partyType: 'customer', partyId: c.id } });
      const bal = Math.round(rows.reduce((s, e) => s + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0) * 100) / 100;
      await prisma.customer.update({ where: { id: c.id }, data: { balance: bal } });
      r.customersFixed++;
    }
    const suppliers = await prisma.supplier.findMany({ select: { id: true } });
    for (const s of suppliers) {
      const rows = await prisma.ledgerEntry.findMany({ where: { partyType: 'supplier', partyId: s.id } });
      const bal = Math.round(rows.reduce((sum, e) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0) * 100) / 100;
      await prisma.supplier.update({ where: { id: s.id }, data: { balance: bal } });
      r.suppliersFixed++;
    }

    res.json({
      ok: true,
      // legacy fields kept so the existing UI toast still works
      salesFixed: r.saleFixed + r.saleCreated,
      purchasesFixed: r.purchaseFixed + r.purchaseCreated,
      customersFixed: r.customersFixed,
      suppliersFixed: r.suppliersFixed,
      dupsRemoved: r.saleDupsRemoved + r.purchaseDupsRemoved,
      ...r,
    });
  } catch (err) { next(err); }
});

export default router;
