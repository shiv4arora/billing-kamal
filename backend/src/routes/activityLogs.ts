import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAdmin } from '../middleware/auth';

const router = Router();
router.use(requireAdmin);

// GET /api/activity-logs?userId=&entity=&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=200
router.get('/', async (req, res, next) => {
  try {
    const { userId, entity, from, to, limit } = req.query as any;
    const where: any = {};
    if (userId) where.userId = userId;
    if (entity) where.entity = entity;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from + 'T00:00:00.000Z');
      if (to)   where.createdAt.lte = new Date(to   + 'T23:59:59.999Z');
    }
    const logs = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 200, 1000),
    });
    res.json(logs);
  } catch (err) { next(err); }
});

// DELETE /api/activity-logs — clear all logs (admin only)
router.delete('/', async (_req, res, next) => {
  try {
    const { count } = await prisma.activityLog.deleteMany({});
    res.json({ ok: true, deleted: count });
  } catch (err) { next(err); }
});

export default router;
