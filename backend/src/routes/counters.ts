import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { peekNextSku } from '../services/counters';

const router = Router();

// Returns current counter values without consuming them
// For 'sku', returns the actual next FREE sku (skipping any already-taken values)
router.get('/', async (_req, res, next) => {
  try {
    const rows = await prisma.counter.findMany();
    const result: Record<string, number> = {};
    for (const row of rows) result[row.key] = row.value;
    // Override sku with the real next free value so the UI preview is accurate
    result['sku'] = await peekNextSku();
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
