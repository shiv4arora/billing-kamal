import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const tasks = await prisma.purchaseTask.findMany({
      orderBy: [{ isUrgent: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(tasks);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { supplierName, supplierId, description, isUrgent, expectedDate, expectedTime, notes } = req.body;
    const task = await prisma.purchaseTask.create({
      data: { supplierName, supplierId: supplierId || null, description, isUrgent: !!isUrgent, expectedDate: expectedDate || '', expectedTime: expectedTime || '', notes: notes || '' },
    });
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { supplierName, supplierId, description, isUrgent, status, expectedDate, expectedTime, notes, notReceivedReason } = req.body;
    const task = await prisma.purchaseTask.update({
      where: { id: req.params.id },
      data: {
        ...(supplierName       !== undefined && { supplierName }),
        ...(supplierId         !== undefined && { supplierId: supplierId || null }),
        ...(description        !== undefined && { description }),
        ...(isUrgent           !== undefined && { isUrgent: !!isUrgent }),
        ...(status             !== undefined && { status }),
        ...(expectedDate       !== undefined && { expectedDate }),
        ...(expectedTime       !== undefined && { expectedTime }),
        ...(notes              !== undefined && { notes }),
        ...(notReceivedReason  !== undefined && { notReceivedReason }),
      },
    });
    res.json(task);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.purchaseTask.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

export default router;
