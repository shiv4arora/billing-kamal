import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { requireAdmin } from '../middleware/auth';

const router = Router();
router.use(requireAdmin);

router.get('/', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(users.map(u => ({ ...u, password: undefined })));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { username, password, name, role, permissions } = req.body;
    if (!username || !password || !name) return res.status(400).json({ error: 'username, password, name required' });
    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { username: username.trim().toLowerCase(), password: hashed, name: name.trim(), role: role || 'user', permissions: permissions || [] },
    });
    res.status(201).json({ ...user, password: undefined });
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { password, ...rest } = req.body;
    const data: any = { ...rest };
    if (password) data.password = await bcrypt.hash(password, 12);
    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    res.json({ ...user, password: undefined });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user!.id) return res.status(400).json({ error: 'Cannot deactivate yourself' });
    await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
