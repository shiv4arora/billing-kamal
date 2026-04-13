let counters = {};

export function generateId(prefix = 'id') {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${ts}${rand}`;
}

export function nextInvoiceNumber(prefix, current) {
  return `${prefix}-${String(current).padStart(4, '0')}`;
}

export function now() { return new Date().toISOString(); }

export function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

export function formatCurrency(n = 0) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);
}

export function formatNumber(n = 0) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}

export function amountInWords(amount) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convert(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
  }

  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let result = 'Rupees ' + convert(rupees);
  if (paise > 0) result += ' and ' + convert(paise) + ' Paise';
  return result + ' Only';
}

export function computeGST(taxableAmount, gstRate, isInterState) {
  const total = (taxableAmount * gstRate) / 100;
  if (isInterState) return { cgst: 0, sgst: 0, igst: total };
  return { cgst: total / 2, sgst: total / 2, igst: 0 };
}

export function buildInvoiceTotals(items, isInterState = false) {
  let subtotal = 0, totalDiscount = 0, totalTaxable = 0, totalCGST = 0, totalSGST = 0, totalIGST = 0;
  const enriched = items.map(item => {
    const gross = item.quantity * item.unitPrice;
    const discAmt = item.discountPct ? (gross * item.discountPct) / 100 : (item.discount || 0);
    const taxable = gross - discAmt;
    const { cgst, sgst, igst } = computeGST(taxable, item.gstRate || 0, isInterState);
    const lineTotal = taxable + cgst + sgst + igst;
    subtotal += gross;
    totalDiscount += discAmt;
    totalTaxable += taxable;
    totalCGST += cgst;
    totalSGST += sgst;
    totalIGST += igst;
    return { ...item, discountAmt: discAmt, taxableAmount: taxable, cgst, sgst, igst, lineTotal };
  });
  const totalGST = totalCGST + totalSGST + totalIGST;
  const grandTotal = totalTaxable + totalGST;
  const roundOff = Math.round(grandTotal) - grandTotal;
  return { items: enriched, subtotal, totalDiscount, totalTaxable, totalCGST, totalSGST, totalIGST, totalGST, grandTotal: grandTotal + roundOff, roundOff };
}

export function getPrice(product, customerType) {
  return product?.pricing?.[customerType] ?? product?.pricing?.shop ?? 0;
}

/** Abbreviation code shown after customer name: Wholesale→H, Shop→S */
export const TYPE_CODE = { wholesale: 'H', shop: 'S' };

/**
 * Returns display label in format "Name Place (TypeCode)"
 * e.g. "MK Uttam Nagar (S)"
 * Works with a customer object OR with separate name/place/type strings.
 */
export function formatCustomerDisplay(nameOrCustomer, place, type) {
  let name, pl, ty;
  if (nameOrCustomer && typeof nameOrCustomer === 'object') {
    ({ name, place: pl, type: ty } = nameOrCustomer);
  } else {
    name = nameOrCustomer; pl = place; ty = type;
  }
  const code = TYPE_CODE[ty] || (ty ? ty.charAt(0).toUpperCase() : '');
  const placePart = pl ? ` ${pl}` : '';
  return `${name || ''}${placePart}${code ? ` (${code})` : ''}`;
}

export function exportToCSV(filename, headers, rows) {
  const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c ?? ''}"`).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function dateRangeFilter(items, dateField, start, end) {
  return items.filter(item => {
    const d = new Date(item[dateField]);
    if (start && d < new Date(start)) return false;
    if (end && d > new Date(end + 'T23:59:59')) return false;
    return true;
  });
}

export function today() { return new Date().toISOString().slice(0, 10); }
export function thisMonthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }
