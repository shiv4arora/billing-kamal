import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';

import authRouter from './routes/auth';
import usersRouter from './routes/users';
import customersRouter from './routes/customers';
import suppliersRouter from './routes/suppliers';
import productsRouter from './routes/products';
import salesRouter from './routes/sales';
import purchasesRouter from './routes/purchases';
import ledgerRouter from './routes/ledger';
import stockRouter from './routes/stockLedger';
import settingsRouter from './routes/settings';
import remindersRouter from './routes/reminders';
import adminRouter from './routes/admin';
import countersRouter from './routes/counters';
import leadsRouter from './routes/leads';
import productionRouter from './routes/production';
import saleReturnsRouter from './routes/saleReturns';
import purchaseReturnsRouter from './routes/purchaseReturns';
import quotationsRouter from './routes/quotations';
import { verifyJWT } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Security — relax CSP so the SPA assets load correctly
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// CORS (only needed when frontend is served separately, e.g. local dev)
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || corsOrigins.includes(origin) || corsOrigins.includes('*')) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' })); // large for logo base64
app.use(cookieParser());

// ── Health check (also used by frontend isApiAvailable()) ────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
// Legacy path kept for any direct calls
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Public API routes ────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);

// ── Protected API routes ─────────────────────────────────────────────────────
app.use('/api', verifyJWT);
app.use('/api/users', usersRouter);
app.use('/api/customers', customersRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/products', productsRouter);
app.use('/api/sales', salesRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/ledger', ledgerRouter);
app.use('/api/stock-ledger', stockRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/counters', countersRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/production', productionRouter);
app.use('/api/sale-returns', saleReturnsRouter);
app.use('/api/purchase-returns', purchaseReturnsRouter);
app.use('/api/quotations', quotationsRouter);

app.use(errorHandler);

// ── Serve React frontend (production) ───────────────────────────────────────
// The frontend dist is built into ../frontend/dist relative to this file.
// Works both when running compiled JS from dist/ and via tsx from src/.
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA catch-all — any non-API GET returns index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  // Dev mode: no build present yet
  app.get('/', (_req, res) => res.json({ message: 'Backend running. Build the frontend to serve the UI.' }));
}

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

export default app;
