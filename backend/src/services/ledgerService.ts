import { Prisma } from '@prisma/client';

type Tx = Omit<Prisma.TransactionClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export async function postSaleInvoice(tx: Tx, opts: {
  customerId: string; customerName: string; date: string;
  invoiceId: string; invoiceNo: string; amount: number;
}) {
  await tx.ledgerEntry.create({
    data: {
      partyType: 'customer', partyId: opts.customerId, partyName: opts.customerName,
      date: opts.date, type: 'sale_invoice', debit: opts.amount, credit: 0,
      referenceType: 'sale_invoice', referenceId: opts.invoiceId, referenceNo: opts.invoiceNo,
      narration: `Sale Invoice ${opts.invoiceNo}`,
    },
  });
}

export async function postPaymentIn(tx: Tx, opts: {
  customerId: string; customerName: string; date: string;
  amount: number; method: string; referenceId: string; referenceNo: string; narration?: string;
}) {
  await tx.ledgerEntry.create({
    data: {
      partyType: 'customer', partyId: opts.customerId, partyName: opts.customerName,
      date: opts.date, type: 'payment_in', debit: 0, credit: opts.amount,
      referenceType: 'payment', referenceId: opts.referenceId, referenceNo: opts.referenceNo,
      narration: opts.narration || `Payment received (${opts.method})`,
    },
  });
}

export async function postSaleReturn(tx: Tx, opts: {
  customerId: string; customerName: string; date: string;
  amount: number; referenceId: string; referenceNo: string; narration?: string;
}) {
  await tx.ledgerEntry.create({
    data: {
      partyType: 'customer', partyId: opts.customerId, partyName: opts.customerName,
      date: opts.date, type: 'sale_return', debit: 0, credit: opts.amount,
      referenceType: 'sale_return', referenceId: opts.referenceId, referenceNo: opts.referenceNo,
      narration: opts.narration || `Sale Return — ${opts.referenceNo}`,
    },
  });
}

export async function postPurchaseInvoice(tx: Tx, opts: {
  supplierId: string; supplierName: string; date: string;
  invoiceId: string; invoiceNo: string; amount: number;
}) {
  await tx.ledgerEntry.create({
    data: {
      partyType: 'supplier', partyId: opts.supplierId, partyName: opts.supplierName,
      date: opts.date, type: 'purchase_invoice', debit: 0, credit: opts.amount,
      referenceType: 'purchase_invoice', referenceId: opts.invoiceId, referenceNo: opts.invoiceNo,
      narration: `Purchase Invoice ${opts.invoiceNo}`,
    },
  });
}

export async function postPaymentOut(tx: Tx, opts: {
  supplierId: string; supplierName: string; date: string;
  amount: number; method: string; referenceId: string; referenceNo: string; narration?: string;
}) {
  await tx.ledgerEntry.create({
    data: {
      partyType: 'supplier', partyId: opts.supplierId, partyName: opts.supplierName,
      date: opts.date, type: 'payment_out', debit: opts.amount, credit: 0,
      referenceType: 'payment', referenceId: opts.referenceId, referenceNo: opts.referenceNo,
      narration: opts.narration || `Payment made (${opts.method})`,
    },
  });
}

export async function postPurchaseReturn(tx: Tx, opts: {
  supplierId: string; supplierName: string; date: string;
  amount: number; referenceId: string; referenceNo: string; narration?: string;
}) {
  await tx.ledgerEntry.create({
    data: {
      partyType: 'supplier', partyId: opts.supplierId, partyName: opts.supplierName,
      date: opts.date, type: 'purchase_return', debit: opts.amount, credit: 0,
      referenceType: 'purchase_return', referenceId: opts.referenceId, referenceNo: opts.referenceNo,
      narration: opts.narration || `Purchase Return — ${opts.referenceNo}`,
    },
  });
}
