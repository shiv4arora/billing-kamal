import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// GET /api/leads
router.get('/', async (_req, res, next) => {
  try {
    const leads = await prisma.lead.findMany({
      where: { isActive: true },
      orderBy: [{ nextFollowUp: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(leads);
  } catch (err) {
    next(err);
  }
});

// POST /api/leads
router.post('/', async (req, res, next) => {
  try {
    const { name, phone, place, source, stage, notes, nextFollowUp, visitDate } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const lead = await prisma.lead.create({
      data: {
        name: name.trim(),
        phone: phone?.trim() || '',
        place: place?.trim() || '',
        source: source || 'whatsapp',
        stage: stage || 'lead',
        notes: notes || '[]',
        nextFollowUp: nextFollowUp || null,
        visitDate: visitDate || null,
      },
    });
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

// PUT /api/leads/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data: Record<string, any> = {};
    const allowed = ['name', 'phone', 'place', 'source', 'stage', 'notes', 'nextFollowUp', 'noPickupCount', 'visitDate'];
    for (const key of allowed) {
      if (key in req.body) data[key] = req.body[key];
    }
    const lead = await prisma.lead.update({ where: { id }, data });
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/leads/:id  (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.lead.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
