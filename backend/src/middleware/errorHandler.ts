import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error(err);

  // Prisma unique constraint
  if (err.code === 'P2002') {
    return res.status(409).json({ error: `Duplicate value for ${err.meta?.target}` });
  }
  // Prisma not found
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({ error: message });
}
