import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

const DEFAULT_SETTINGS = {
  company: { name: 'My Trading Co.', address: '', phone: '', email: '', gstin: '', state: 'Maharashtra', stateCode: '27', logo: null },
  invoice: { salePrefix: 'SI', purchasePrefix: 'PI', defaultDueDays: 14, showHSN: true, bankDetails: '', terms: 'Goods once sold will not be returned.' },
  tax: { defaultGSTRate: 0, intraState: true },
  lowStockThreshold: 10,
  reminders: { enabled: true, schedule: [0, 3, 7], messageTemplate: '' },
};

router.get('/', async (_req, res, next) => {
  try {
    let s = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    if (!s) {
      s = await prisma.settings.create({ data: { id: 'singleton', data: DEFAULT_SETTINGS } });
    }
    res.json(s.data);
  } catch (err) { next(err); }
});

router.put('/', async (req, res, next) => {
  try {
    const s = await prisma.settings.findUnique({ where: { id: 'singleton' } });
    const current: any = (s?.data as any) || DEFAULT_SETTINGS;

    // Support both full-object update and dot-path update { path, value }
    let next: any;
    if (req.body.path !== undefined) {
      next = JSON.parse(JSON.stringify(current));
      const parts = (req.body.path as string).split('.');
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = req.body.value;
    } else {
      next = { ...current, ...req.body };
    }

    const updated = await prisma.settings.upsert({
      where: { id: 'singleton' },
      update: { data: next },
      create: { id: 'singleton', data: next },
    });
    res.json(updated.data);
  } catch (err) { next(err); }
});

export default router;
