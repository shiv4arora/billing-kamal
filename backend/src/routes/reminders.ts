import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/pending', async (_req, res, next) => {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    const s: any = settings?.data || {};
    const reminderSettings = s.reminders || { enabled: true, schedule: [0, 3, 7] };

    if (!reminderSettings.enabled) return res.json([]);

    const today = new Date().toISOString().slice(0, 10);
    const schedule: number[] = reminderSettings.schedule || [0, 3, 7];

    const overdueInvoices = await prisma.saleInvoice.findMany({
      where: {
        status: { in: ['issued'] },
        paymentStatus: { in: ['unpaid', 'partial'] },
        dueDate: { lte: today, not: '' },
      },
    });

    const pending = [];
    for (const inv of overdueInvoices) {
      const balance = Number(inv.grandTotal) - Number(inv.amountPaid);
      if (balance <= 0.01) continue;

      const dueMs = new Date(inv.dueDate).getTime();
      const todayMs = new Date(today).getTime();
      const daysPastDue = Math.max(0, Math.floor((todayMs - dueMs) / 86400000));

      for (const offset of schedule) {
        if (daysPastDue < offset) continue;
        const logEntry = await prisma.reminderLog.findUnique({
          where: { invoiceId_dayOffset: { invoiceId: inv.id, dayOffset: offset } },
        });
        pending.push({ inv, offset, daysPastDue, logEntry, sent: !!logEntry });
      }
    }

    res.json(pending);
  } catch (err) { next(err); }
});

router.get('/log', async (_req, res, next) => {
  try {
    const logs = await prisma.reminderLog.findMany({ orderBy: { sentAt: 'desc' } });
    res.json(logs);
  } catch (err) { next(err); }
});

router.post('/log', async (req, res, next) => {
  try {
    const { invoiceId, dayOffset, customerName, invoiceNumber } = req.body;
    const log = await prisma.reminderLog.upsert({
      where: { invoiceId_dayOffset: { invoiceId, dayOffset } },
      update: { sentAt: new Date(), customerName, invoiceNumber },
      create: { invoiceId, dayOffset, customerName: customerName || '', invoiceNumber: invoiceNumber || '' },
    });
    res.status(201).json(log);
  } catch (err) { next(err); }
});

export default router;
