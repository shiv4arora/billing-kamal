// Server-side port of frontend buildInvoiceTotals + computeGST

interface RawItem {
  productId?: string;
  productName?: string;
  sku?: string;
  hsnCode?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  discountPct?: number;
  gstRate?: number;
  [key: string]: any;
}

interface EnrichedItem extends RawItem {
  discountAmt: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
}

interface InvoiceTotals {
  items: EnrichedItem[];
  subtotal: number;
  totalDiscount: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  totalGST: number;
  grandTotal: number;
  roundOff: number;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function buildInvoiceTotals(rawItems: RawItem[], isInterState = false): InvoiceTotals {
  let subtotal = 0, totalDiscount = 0, totalCGST = 0, totalSGST = 0, totalIGST = 0;

  const items: EnrichedItem[] = rawItems.map(item => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const discPct = Number(item.discountPct) || 0;
    const gstRate = Number(item.gstRate) || 0;

    const gross = round2(qty * price);
    const discountAmt = round2(gross * discPct / 100);
    const taxable = round2(gross - discountAmt);
    const gstAmt = round2(taxable * gstRate / 100);

    let cgst = 0, sgst = 0, igst = 0;
    if (gstRate > 0) {
      if (isInterState) {
        igst = gstAmt;
      } else {
        cgst = round2(gstAmt / 2);
        sgst = round2(gstAmt / 2);
      }
    }

    const lineTotal = round2(taxable + cgst + sgst + igst);

    subtotal += gross;
    totalDiscount += discountAmt;
    totalCGST += cgst;
    totalSGST += sgst;
    totalIGST += igst;

    return { ...item, discountAmt, taxableAmount: taxable, cgst, sgst, igst, lineTotal };
  });

  subtotal = round2(subtotal);
  totalDiscount = round2(totalDiscount);
  totalCGST = round2(totalCGST);
  totalSGST = round2(totalSGST);
  totalIGST = round2(totalIGST);
  const totalGST = round2(totalCGST + totalSGST + totalIGST);
  const rawTotal = round2(subtotal - totalDiscount + totalGST);
  const grandTotal = Math.round(rawTotal);
  const roundOff = round2(grandTotal - rawTotal);

  return { items, subtotal, totalDiscount, totalCGST, totalSGST, totalIGST, totalGST, grandTotal, roundOff };
}
