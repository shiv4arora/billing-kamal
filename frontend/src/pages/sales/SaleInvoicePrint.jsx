import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useInvoices } from '../../context/InvoiceContext';
import { useSettings } from '../../context/SettingsContext';
import { useCustomers } from '../../context/CustomerContext';
import { formatCurrency, formatDate, amountInWords, formatCustomerDisplay } from '../../utils/helpers';

export default function SaleInvoicePrint() {
  const { id } = useParams();
  const { getSaleInvoice } = useInvoices();
  const { settings } = useSettings();
  const { get: getCustomer } = useCustomers();
  const inv = getSaleInvoice(id);
  const invoiceRef = useRef(null);
  const [sharing, setSharing] = useState(false);

  if (!inv) return <div className="p-8 text-center">Invoice not found.</div>;
  const { company, invoice: invSettings } = settings;

  // Customer address/GSTIN: stored on invoice (new) OR looked up from context (legacy)
  const custFromCtx    = inv.customerId ? getCustomer(inv.customerId) : null;
  const customerAddress = inv.customerAddress || custFromCtx?.address || '';
  const customerGstin   = inv.customerGstin   || custFromCtx?.gstin   || '';
  const customerPhone   = custFromCtx?.phone   || '';

  const items       = inv.items || [];
  const hasDiscount = items.some(item => (item.discountPct || 0) > 0);
  const totalQty    = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  const totalTax    = (inv.totalCGST || 0) + (inv.totalSGST || 0) + (inv.totalIGST || 0);
  const totalTaxable = items.reduce((s, i) => s + (Number(i.taxableAmount) || Number(i.lineTotal) || 0), 0);
  const balanceDue  = (inv.grandTotal || 0) - (inv.amountPaid || 0);

  const buildMessage = () => {
    const lines = [
      `Dear ${inv.customerName || 'Customer'},`,
      '',
      `Please find your invoice details:`,
      `Invoice No : ${inv.invoiceNumber}`,
      `Date       : ${formatDate(inv.date)}`,
      `Amount     : ${formatCurrency(inv.grandTotal)}`,
      ...(balanceDue > 0.01 ? [`Balance Due: ${formatCurrency(balanceDue)}`] : [`Status     : Paid`]),
      '',
      `${company.name || 'Kamal Jewellers'}`,
      company.address || 'Sadar Bazar, New Delhi- 110006',
    ];
    return lines.join('\n');
  };

  const generatePdfBlob = async () => {
    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF } = await import('jspdf');

    // Temporarily strip dark mode so PDF is always light
    const wasDark = document.documentElement.classList.contains('dark');
    if (wasDark) document.documentElement.classList.remove('dark');

    const el = invoiceRef.current;
    let canvas;
    try {
      canvas = await html2canvas(el, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
    } finally {
      if (wasDark) document.documentElement.classList.add('dark');
    }

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW  = pdf.internal.pageSize.getWidth();
    const pageH  = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2;
    const pxPerMm  = canvas.width / contentW;

    // ── Measure tbody row positions in canvas pixels ──
    const elRect      = el.getBoundingClientRect();
    const canvasScale = canvas.width / elRect.width; // = html2canvas scale (1.5)
    const tbodyRows   = Array.from(el.querySelectorAll('tbody tr'));
    const rowBounds   = tbodyRows.map(tr => {
      const r = tr.getBoundingClientRect();
      return {
        top:    (r.top    - elRect.top) * canvasScale,
        bottom: (r.bottom - elRect.top) * canvasScale,
      };
    });

    // Table left/right edges for border lines
    const tableEl    = el.querySelector('table');
    const tableRect  = tableEl ? tableEl.getBoundingClientRect() : elRect;
    const tableLeft  = (tableRect.left  - elRect.left) * canvasScale;
    const tableRight = (tableRect.right - elRect.left) * canvasScale;

    // ── Build item-based page slices: 34 items on page 1, 45 on subsequent pages ──
    const ITEMS_P1 = 34;
    const ITEMS_PN = 45;
    // slices: [{startY, endY, firstIdx, lastIdx}]
    const slices = [];
    if (rowBounds.length > 0) {
      const end1 = Math.min(ITEMS_P1 - 1, rowBounds.length - 1);
      slices.push({ startY: 0, endY: rowBounds[end1].bottom, firstIdx: 0, lastIdx: end1 });
      let si = ITEMS_P1;
      while (si < rowBounds.length) {
        const ei = Math.min(si + ITEMS_PN - 1, rowBounds.length - 1);
        slices.push({ startY: rowBounds[si].top, endY: rowBounds[ei].bottom, firstIdx: si, lastIdx: ei });
        si += ITEMS_PN;
      }
      // Extend the last slice to canvas bottom so totals/signature are included
      slices[slices.length - 1].endY = canvas.height;
    } else {
      slices.push({ startY: 0, endY: canvas.height, firstIdx: 0, lastIdx: 0 });
    }
    const totalPages = slices.length;

    // ── Draw top/bottom borders on the full canvas for each slice ──
    const cCtx = canvas.getContext('2d');
    cCtx.strokeStyle = '#374151';
    cCtx.lineWidth   = Math.round(2 * canvasScale);
    const drawLine = y => {
      cCtx.beginPath(); cCtx.moveTo(tableLeft, y); cCtx.lineTo(tableRight, y); cCtx.stroke();
    };
    for (const s of slices) {
      if (rowBounds.length > 0) {
        drawLine(rowBounds[s.firstIdx].top    + cCtx.lineWidth / 2);
        drawLine(rowBounds[s.lastIdx].bottom  - cCtx.lineWidth / 2);
      }
    }

    // ── Render each slice onto an A4 page ──
    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage();
      const { startY, endY } = slices[page];
      const sliceH = endY - startY;

      const strip = document.createElement('canvas');
      strip.width  = canvas.width;
      strip.height = Math.max(sliceH, 1);
      const sCtx = strip.getContext('2d');
      sCtx.fillStyle = '#ffffff';
      sCtx.fillRect(0, 0, strip.width, strip.height);
      sCtx.drawImage(canvas, 0, startY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

      // Scale down only if taller than the content area; otherwise place at natural size
      const sliceH_mm = sliceH / pxPerMm;
      const placedH   = Math.min(sliceH_mm, contentH);
      const placedW   = contentW * (placedH / sliceH_mm);
      const offsetX   = margin + (contentW - placedW) / 2;

      pdf.addImage(strip.toDataURL('image/jpeg', 0.82), 'JPEG', offsetX, margin, placedW, placedH);

      // Page number
      pdf.setFontSize(8);
      pdf.setTextColor(130, 130, 130);
      pdf.text(`Page ${page + 1} of ${totalPages}`, pageW / 2, pageH - 4, { align: 'center' });
    }
    return pdf.output('blob');
  };

  const sharePdf = async () => {
    const phone = customerPhone.replace(/\D/g, '');
    const text  = buildMessage();
    const parts = [inv.customerName, inv.customerPlace].filter(Boolean).join(' ');
    const fileName = `${parts || 'Invoice'} - ${inv.invoiceNumber || id}.pdf`;

    try {
      setSharing(true);
      const blob = await generatePdfBlob();
      const file = new File([blob], fileName, { type: 'application/pdf' });

      // Native share sheet (iOS/Android) with PDF
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }

      // Fallback: download the PDF
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err.name !== 'AbortError') {
        // Last fallback: WhatsApp text only
        const encoded = encodeURIComponent(text);
        const url = phone ? `https://wa.me/91${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
        window.open(url, '_blank');
      }
    } finally {
      setSharing(false);
    }
  };

  const downloadPdf = async () => {
    try {
      setSharing(true);
      const blob = await generatePdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const nameParts = [inv.customerName, inv.customerPlace].filter(Boolean).join(' ');
      a.download = `${nameParts || 'Invoice'} - ${inv.invoiceNumber || id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <style>{`
        @media print {
          @page { margin-bottom: 14mm; }
          .print-page-num {
            display: block !important;
            position: fixed;
            bottom: 4mm;
            left: 0; right: 0;
            text-align: center;
            font-size: 8pt;
            color: #9ca3af;
          }
          .print-page-num::after {
            content: "Page " counter(page) " of " counter(pages);
          }
        }
        .print-page-num { display: none; }
      `}</style>
      <div className="print-page-num" />
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm px-4 py-3 flex gap-2 flex-wrap items-center">
        <button onClick={() => window.history.back()} className="text-gray-500 hover:text-gray-700 text-sm px-2 py-1.5">
          ← Back
        </button>
        <div className="flex-1" />
        <button onClick={() => {
            const wasDark = document.documentElement.classList.contains('dark');
            if (wasDark) document.documentElement.classList.remove('dark');
            window.print();
            if (wasDark) document.documentElement.classList.add('dark');
          }}
          className="hidden sm:flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
          🖨 Print
        </button>
        <button onClick={downloadPdf} disabled={sharing}
          className="hidden sm:flex items-center gap-1.5 bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-60">
          {sharing ? '⏳…' : '📄 PDF'}
        </button>
        <button onClick={sharePdf} disabled={sharing}
          className="flex items-center gap-1.5 bg-green-500 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-green-600 disabled:opacity-60">
          {sharing ? '⏳ Generating…' : '📤 Share'}
        </button>
      </div>

      {/* A4 preview — horizontally scrollable on mobile so full layout is always visible */}
      <div className="overflow-x-auto py-6 px-2">
        <div className="min-w-[210mm]">
      <div ref={invoiceRef} className="p-8 max-w-[210mm] mx-auto text-[13px] bg-white border border-gray-300 shadow-md">
        {/* Header */}
        <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-gray-800">
          <div>
            {company.logo && <img src={company.logo} alt="logo" className="h-12 mb-2" />}
            <h1 className="text-xl font-bold text-gray-900">{company.name || 'Kamal Jewellers'}</h1>
            <p className="text-gray-600 whitespace-pre-line">{company.address || 'Sadar Bazar, New Delhi- 110006'}</p>
            {company.phone && <p className="text-gray-600">Ph: {company.phone}</p>}
            <p className="text-gray-600">GSTIN: {company.gstin || '07AHDPR6884P1ZC'}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">PROFORMA INVOICE</p>
            <p className="text-gray-700 mt-1">
              <span className="font-semibold">Invoice No: </span>
              <strong>{inv.invoiceNumber}</strong>
            </p>
            <p className="text-gray-700">
              <span className="font-semibold">Date: </span>
              <strong>{formatDate(inv.date)}</strong>
            </p>
          </div>
        </div>

        {/* Bill To */}
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Bill To</p>
          <p className="font-semibold text-gray-900">
            {formatCustomerDisplay(inv.customerName, inv.customerPlace, inv.customerType)}
          </p>
          {customerAddress && <p className="text-gray-600 text-xs mt-0.5">{customerAddress}</p>}
          {customerPhone   && <p className="text-gray-600 text-xs mt-0.5">Ph: {customerPhone}</p>}
          {customerGstin   && <p className="text-gray-600 text-xs mt-0.5 font-mono">GSTIN: {customerGstin}</p>}
        </div>

        {/* Items Table */}
        <table className="w-full mb-4 border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-1.5 text-left">#</th>
              <th className="border border-gray-300 px-2 py-1.5 text-left">Description</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right">Qty</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right">Rate</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right">Total</th>
              {hasDiscount && <th className="border border-gray-300 px-2 py-1.5 text-right">Disc%</th>}
              {hasDiscount && <th className="border border-gray-300 px-2 py-1.5 text-right">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const gross = item.quantity * item.unitPrice;
              const taxable = item.taxableAmount ?? item.lineTotal;
              return (
                <tr key={i}>
                  <td className="border border-gray-300 px-2 py-1">{i + 1}</td>
                  <td className="border border-gray-300 px-2 py-1">
                    {item.productName}
                    {item.sku && <span className="ml-1 text-[10px] text-gray-400 font-mono">[#{item.sku}]</span>}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-right">{item.quantity} {item.unit}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="border border-gray-300 px-2 py-1 text-right font-semibold">{formatCurrency(gross)}</td>
                  {hasDiscount && <td className="border border-gray-300 px-2 py-1 text-right">{item.discountPct || 0}%</td>}
                  {hasDiscount && <td className="border border-gray-300 px-2 py-1 text-right font-semibold">{formatCurrency(taxable)}</td>}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold">
              <td colSpan={2} className="border border-gray-300 px-2 py-1.5 text-right">Total</td>
              <td className="border border-gray-300 px-2 py-1.5 text-right">{totalQty}</td>
              <td className="border border-gray-300 px-2 py-1.5"></td>
              <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}</td>
              {hasDiscount && <td className="border border-gray-300 px-2 py-1.5"></td>}
              {hasDiscount && <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(totalTaxable)}</td>}
            </tr>
          </tfoot>
        </table>

        {/* Summary + Amount in words */}
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-700 mb-1">Amount in Words:</p>
            <p className="text-xs text-gray-600 italic">{amountInWords(inv.grandTotal)}</p>
            {invSettings.bankDetails && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-700 mb-1">Bank Details:</p>
                <p className="text-xs text-gray-600 whitespace-pre-line">{invSettings.bankDetails}</p>
              </div>
            )}
          </div>
          <div className="w-52 text-xs">
            {inv.totalDiscount > 0 && <div className="flex justify-between py-0.5"><span>Discount</span><span className="text-red-600">-{formatCurrency(inv.totalDiscount)}</span></div>}
            {inv.totalCGST > 0 && <div className="flex justify-between py-0.5"><span>CGST</span><span>{formatCurrency(inv.totalCGST)}</span></div>}
            {inv.totalSGST > 0 && <div className="flex justify-between py-0.5"><span>SGST</span><span>{formatCurrency(inv.totalSGST)}</span></div>}
            {inv.totalIGST > 0 && <div className="flex justify-between py-0.5"><span>IGST</span><span>{formatCurrency(inv.totalIGST)}</span></div>}
            {totalTax > 0 && (
              <div className="flex justify-between py-0.5 font-semibold border-t border-gray-200 mt-0.5 pt-0.5">
                <span>Total Tax</span><span>{formatCurrency(totalTax)}</span>
              </div>
            )}
            {inv.packingCharges > 0 && <div className="flex justify-between py-0.5"><span>Packing</span><span>{formatCurrency(inv.packingCharges)}</span></div>}
            {inv.shippingCharges > 0 && <div className="flex justify-between py-0.5"><span>Shipping</span><span>{formatCurrency(inv.shippingCharges)}</span></div>}
            <div className="flex justify-between font-bold text-sm border-t border-gray-400 mt-1 pt-1">
              <span>Grand Total</span><span>{formatCurrency(inv.grandTotal)}</span>
            </div>
            {(inv.amountPaid || 0) > 0 && (
              <div className="flex justify-between py-0.5 text-green-700">
                <span>Amount Paid ({inv.paymentMethod})</span><span>{formatCurrency(inv.amountPaid)}</span>
              </div>
            )}
            {balanceDue > 0.01 && (
              <div className="flex justify-between py-0.5 font-semibold text-red-700">
                <span>Balance Due</span><span>{formatCurrency(balanceDue)}</span>
              </div>
            )}
          </div>
        </div>

        {invSettings.terms && (
          <div className="mt-6 pt-4 border-t text-xs text-gray-500">
            <span className="font-semibold">Terms: </span>{invSettings.terms}
          </div>
        )}
        <div className="mt-8 flex justify-end">
          <div className="text-center text-xs text-gray-600">
            <div className="w-36 border-b border-gray-400 mb-1"></div>
            Authorised Signatory
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}
