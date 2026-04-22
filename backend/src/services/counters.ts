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

  const row = await client.counter.findUnique({ where: { key: 'sku' } });
  if (!row) throw new Error("Counter 'sku' not found");

  // Scan in-memory until we find a free SKU — never burn counter values in the loop
  let candidate = row.value;
  while (true) {
    const existing = await prisma.product.findUnique({ where: { sku: String(candidate) } });
    if (!existing) break;
    candidate++;
  }

  // Write the counter once, jumping past the allocated range
  await client.counter.update({ where: { key: 'sku' }, data: { value: candidate + count } });

  return candidate;
}

// Returns the next free SKU without consuming it (for preview in the UI)
export async function peekNextSku(): Promise<number> {
  const row = await prisma.counter.findUnique({ where: { key: 'sku' } });
  if (!row) return 1001;
  let candidate = row.value;
  while (true) {
    const existing = await prisma.product.findUnique({ where: { sku: String(candidate) } });
    if (!existing) return candidate;
    candidate++;
  }
}
