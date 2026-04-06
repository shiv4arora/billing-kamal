import { prisma } from '../lib/prisma';

// Accept an optional tx so callers inside prisma.$transaction don't create a nested one
async function nextCounter(key: string, tx?: any): Promise<number> {
  const client = tx || prisma;
  const row = await client.counter.findUnique({ where: { key } });
  if (!row) throw new Error(`Counter '${key}' not found`);
  const n = row.value;
  await client.counter.update({ where: { key }, data: { value: n + 1 } });
  return n;
}

async function nextCounterBulk(key: string, count: number, tx?: any): Promise<number> {
  const client = tx || prisma;
  const row = await client.counter.findUnique({ where: { key } });
  if (!row) throw new Error(`Counter '${key}' not found`);
  const n = row.value;
  await client.counter.update({ where: { key }, data: { value: n + count } });
  return n;
}

export async function nextSaleInvoiceNumber(prefix: string, tx?: any): Promise<string> {
  const n = await nextCounter('saleInvoice', tx);
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export async function nextPurchaseInvoiceNumber(prefix: string, tx?: any): Promise<string> {
  const n = await nextCounter('purchaseInvoice', tx);
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export async function allocateSkuNumbers(count = 1, tx?: any): Promise<number> {
  return nextCounterBulk('sku', count, tx);
}
