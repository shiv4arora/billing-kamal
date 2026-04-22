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

export async function nextSaleInvoiceNumber(prefix: string, tx?: any): Promise<string> {
  const n = await nextCounter('saleInvoice', tx);
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export async function nextPurchaseInvoiceNumber(prefix: string, tx?: any): Promise<string> {
  const n = await nextCounter('purchaseInvoice', tx);
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

// Returns the highest numeric SKU currently in the database
async function maxExistingSku(): Promise<number> {
  const products = await prisma.product.findMany({ select: { sku: true } });
  return products.reduce((max, p) => {
    const n = parseInt(p.sku || '0', 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
}

// Allocates the next SKU — always starts above both the counter AND the real max SKU
// so the preview and the actual assigned value always agree
export async function allocateSkuNumbers(count = 1, tx?: any): Promise<number> {
  const client = tx || prisma;

  const row = await client.counter.findUnique({ where: { key: 'sku' } });
  if (!row) throw new Error("Counter 'sku' not found");

  const maxDb = await maxExistingSku();
  // Use whichever is higher so we never collide or fall behind
  const candidate = Math.max(row.value, maxDb + 1);

  await client.counter.update({ where: { key: 'sku' }, data: { value: candidate + count } });

  return candidate;
}

// Returns the next SKU without consuming it (for the UI preview)
export async function peekNextSku(): Promise<number> {
  const row = await prisma.counter.findUnique({ where: { key: 'sku' } });
  const maxDb = await maxExistingSku();
  return Math.max(row?.value ?? 1001, maxDb + 1);
}
