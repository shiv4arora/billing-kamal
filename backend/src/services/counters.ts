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

// Self-healing SKU allocator — skips any counter values already used by existing products
// This prevents duplicate SKU errors even if the counter gets out of sync
export async function allocateSkuNumbers(count = 1, tx?: any): Promise<number> {
  const client = tx || prisma;
  let candidate: number;

  // Keep advancing until we find a free SKU
  while (true) {
    const row = await client.counter.findUnique({ where: { key: 'sku' } });
    if (!row) throw new Error("Counter 'sku' not found");
    candidate = row.value;
    await client.counter.update({ where: { key: 'sku' }, data: { value: candidate + count } });

    // Check if this SKU is already taken
    const existing = await prisma.product.findUnique({ where: { sku: String(candidate) } });
    if (!existing) break; // free — use it
    // else: loop again with the next counter value
  }

  return candidate;
}
