import { prisma } from '../lib/prisma';

// SQLite serializes transactions, so a simple findUnique + update inside
// a transaction is atomic — no need for SELECT ... FOR UPDATE.
async function nextCounter(key: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.counter.findUnique({ where: { key } });
    if (!row) throw new Error(`Counter '${key}' not found`);
    const n = row.value;
    await tx.counter.update({ where: { key }, data: { value: n + 1 } });
    return n;
  });
}

async function nextCounterBulk(key: string, count: number): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.counter.findUnique({ where: { key } });
    if (!row) throw new Error(`Counter '${key}' not found`);
    const n = row.value;
    await tx.counter.update({ where: { key }, data: { value: n + count } });
    return n;
  });
}

export async function nextSaleInvoiceNumber(prefix: string): Promise<string> {
  const n = await nextCounter('saleInvoice');
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export async function nextPurchaseInvoiceNumber(prefix: string): Promise<string> {
  const n = await nextCounter('purchaseInvoice');
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export async function allocateSkuNumbers(count = 1): Promise<number> {
  return nextCounterBulk('sku', count);
}
