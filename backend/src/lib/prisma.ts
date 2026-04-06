import { PrismaClient } from '@prisma/client';

// Fields stored as JSON strings in SQLite (no native Json/Array support)
const JSON_FIELDS: Record<string, string[]> = {
  User: ['permissions'],
  Product: ['pricing'],
  SaleInvoice: ['items'],
  PurchaseInvoice: ['items'],
  Settings: ['data'],
};

function serializeFields(model: string, data: any) {
  if (!data || typeof data !== 'object') return;
  const fields = JSON_FIELDS[model];
  if (!fields) return;
  for (const field of fields) {
    if (field in data && typeof data[field] !== 'string') {
      data[field] = JSON.stringify(data[field]);
    }
  }
}

function deserializeRow(model: string, row: any) {
  if (!row || typeof row !== 'object') return;
  const fields = JSON_FIELDS[model];
  if (!fields) return;
  for (const field of fields) {
    if (field in row && typeof row[field] === 'string') {
      try { row[field] = JSON.parse(row[field]); } catch { /* leave as string */ }
    }
  }
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const client = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// Auto-serialize JSON fields before write, auto-deserialize after read
(client as any).$use(async (params: any, next: any) => {
  const model: string | undefined = params.model;

  if (model && JSON_FIELDS[model]) {
    const action: string = params.action;
    if (['create', 'update', 'createMany', 'updateMany'].includes(action)) {
      serializeFields(model, params.args.data);
    } else if (action === 'upsert') {
      serializeFields(model, params.args.create);
      serializeFields(model, params.args.update);
    }
  }

  const result = await next(params);

  if (model && JSON_FIELDS[model] && result) {
    if (Array.isArray(result)) {
      result.forEach(row => deserializeRow(model, row));
    } else if (typeof result === 'object') {
      deserializeRow(model, result);
    }
  }

  return result;
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client;

export const prisma = client;
