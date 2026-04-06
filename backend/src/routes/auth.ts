import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { verifyJWT } from '../middleware/auth';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    // SQLite comparison is case-sensitive; normalise to lowercase on both sides
    const user = await prisma.user.findFirst({
      where: { username: username.trim().toLowerCase(), isActive: true },
    });
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    let valid: boolean;
    if (user.password.startsWith('$2b$') || user.password.startsWith('$2a$')) {
      valid = await bcrypt.compare(password, user.password);
    } else {
      // Legacy plaintext — compare then upgrade
      valid = user.password === password;
      if (valid) {
        const hashed = await bcrypt.hash(password, 12);
        await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
      }
    }
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

    const token = signToken({ id: user.id, role: user.role, permissions: user.permissions });
    res.json({
      token,
      user: { id: user.id, username: user.username, name: user.name, role: user.role, permissions: user.permissions },
    });
  } catch (err) { next(err); }
});

router.get('/me', verifyJWT, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'User not found' });
    res.json({ id: user.id, username: user.username, name: user.name, role: user.role, permissions: user.permissions });
  } catch (err) { next(err); }
});

router.post('/logout', verifyJWT, (_req, res) => res.json({ ok: true }));

export default router;
