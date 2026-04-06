import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// Returns current counter values without consuming them
router.get('/', async (_req, res, next) => {
  try {
    const rows = await prisma.counter.findMany();
    const result: Record<string, number> = {};
    for (const row of rows) result[row.key] = row.value;
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
