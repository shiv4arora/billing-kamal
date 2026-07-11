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
  const [format, setFormat] = useState('a4'); // 'a4' | 'thermal'

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

  const buildMessage = () => {
    const lines = [
      `Dear ${inv.customerName || 'Customer'},`,
      '',
      `Please find your invoice details:`,
      `Invoice No : ${inv.invoiceNumber}`,
      `Date       : ${formatDate(inv.date)}`,
      `Amount     : ${formatCurrency(inv.grandTotal)}`,
      '',
      `${company.name || 'Kamal Jewellers'}`,
      company.address || 'Sadar Bazar, New Delhi- 110006',
    ];
    return lines.join('\n');
  };

  const generatePdfBlob = async () => {
    const { pdf } = await import('@react-pdf/renderer');
    const { createElement } = await import('react');
    if (format === 'thermal') {
      const { ThermalInvoicePDF } = await import('./SaleInvoiceThermalPDF');
      return await pdf(
        createElement(ThermalInvoicePDF, { inv, company, invSettings, customerAddress, customerGstin, customerPhone })
      ).toBlob();
    }
    const { InvoicePDF } = await import('./SaleInvoicePDF');
    return await pdf(
      createElement(InvoicePDF, { inv, company, invSettings, customerAddress, customerGstin, customerPhone })
    ).toBlob();
  };

  const shareWhatsApp = async () => {
    const phone = customerPhone.replace(/\D/g, '');
    const text  = buildMessage();

    // Try Web Share API with PDF file (works on mobile)
    if (navigator.canShare) {
      try {
        setSharing(true);
        const blob = await generatePdfBlob();
        const parts = [inv.customerName, inv.customerPlace].filter(Boolean).join(' ');
        const fileName = `${parts || 'Invoice'} - ${inv.invoiceNumber || id}.pdf`;
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text });
          return;
        }
      } catch (err) {
        console.warn('Share with file failed, trying text-only:', err);
      } finally {
        setSharing(false);
      }
    }

    // Fallback: open WhatsApp with text only
    const encoded = encodeURIComponent(text);
    const url = phone
      ? `https://wa.me/91${phone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  const pdfFileName = () => {
    const nameParts = [inv.customerName, inv.customerPlace].filter(Boolean).join(' ');
    const suffix = format === 'thermal' ? ' - Receipt' : '';
    return `${nameParts || 'Invoice'} - ${inv.invoiceNumber || id}${suffix}.pdf`;
  };

  const downloadPdf = async () => {
    try {
      setSharing(true);
      const blob = await generatePdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfFileName();
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setSharing(false);
    }
  };

  const printPdf = async () => {
    try {
      setSharing(true);
      const blob = await generatePdfBlob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      // Revoke after the tab has had time to load the blob
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      if (win) win.focus();
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="no-print p-4 bg-gray-100 flex gap-3 flex-wrap items-center">
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          <button onClick={() => setFormat('a4')}
            className={`px-3 py-2 text-sm font-medium ${format === 'a4' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            🖨 A4 Invoice
          </button>
          <button onClick={() => setFormat('thermal')}
            className={`px-3 py-2 text-sm font-medium border-l border-gray-300 ${format === 'thermal' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            🧾 3" Receipt
          </button>
        </div>
        <button onClick={printPdf} disabled={sharing}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
          {sharing ? '⏳ Generating…' : '🖨 Print'}
        </button>
        <button onClick={downloadPdf} disabled={sharing}
          className="bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-600 disabled:opacity-60">
          {sharing ? '⏳ Generating…' : '📄 Download PDF'}
        </button>
        <button onClick={shareWhatsApp} disabled={sharing}
          className="bg-green-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-600 disabled:opacity-60">
          {sharing ? '⏳ Generating…' : '💬 Send on WhatsApp'}
        </button>
        <button onClick={() => window.history.back()}
          className="bg-gray-200 px-4 py-2 rounded text-sm">
          ← Back
        </button>
      </div>

      {format === 'a4' && (
      <div ref={invoiceRef} className="p-8 max-w-[210mm] mx-auto text-[13px] border border-gray-300 rounded">
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
            {((inv.packingCharges || 0) + (inv.shippingCharges || 0)) > 0 && <div className="flex justify-between py-0.5"><span>Packing &amp; Shipping</span><span>{formatCurrency((inv.packingCharges || 0) + (inv.shippingCharges || 0))}</span></div>}
            <div className="flex justify-between font-bold text-sm border-t border-gray-400 mt-1 pt-1">
              <span>Grand Total</span><span>{formatCurrency(inv.grandTotal)}</span>
            </div>
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
      )}

      {format === 'thermal' && (
        <div className="py-6 flex justify-center">
          <div className="w-[80mm] bg-white border border-dashed border-gray-300 rounded px-3 py-4 text-[11px] font-mono leading-snug">
            {company.logo && <img src={company.logo} alt="logo" className="h-8 mx-auto mb-1" />}
            <p className="text-center font-bold text-sm">{company.name || 'Kamal Jewellers'}</p>
            <p className="text-center text-[10px] text-gray-600 whitespace-pre-line">{company.address || 'Sadar Bazar, New Delhi- 110006'}</p>
            {company.phone && <p className="text-center text-[10px] text-gray-600">Ph: {company.phone}</p>}
            <p className="text-center text-[10px] text-gray-600">GSTIN: {company.gstin || '07AHDPR6884P1ZC'}</p>

            <div className="border-b border-dashed border-gray-500 my-2" />

            <div className="flex justify-between"><span>Invoice No:</span><span className="font-bold">{inv.invoiceNumber}</span></div>
            <div className="flex justify-between"><span>Date:</span><span className="font-bold">{formatDate(inv.date)}</span></div>

            <div className="border-b border-dashed border-gray-400 my-2" />

            <p className="text-[9px] uppercase text-gray-500 font-semibold">Bill To</p>
            <p className="font-bold">{formatCustomerDisplay(inv.customerName, inv.customerPlace, inv.customerType)}</p>
            {customerAddress && <p className="text-[10px] text-gray-600">{customerAddress}</p>}
            {customerPhone && <p className="text-[10px] text-gray-600">Ph: {customerPhone}</p>}
            {customerGstin && <p className="text-[10px] text-gray-600">GSTIN: {customerGstin}</p>}

            <div className="border-b border-dashed border-gray-500 my-2" />

            {items.map((item, i) => {
              const gross = item.quantity * item.unitPrice;
              const taxable = item.taxableAmount ?? item.lineTotal;
              const amount = hasDiscount ? taxable : gross;
              return (
                <div key={i} className="mb-1.5">
                  <p className="font-semibold">{i + 1}. {item.productName}{item.sku && <span className="text-[9px] text-gray-400">  [#{item.sku}]</span>}</p>
                  <div className="flex justify-between text-[10px]">
                    <span>{item.quantity} {item.unit} x {formatCurrency(item.unitPrice)}{hasDiscount && item.discountPct ? ` (-${item.discountPct}%)` : ''}</span>
                    <span className="font-semibold">{formatCurrency(amount)}</span>
                  </div>
                </div>
              );
            })}

            <div className="border-b border-dashed border-gray-500 my-2" />

            <div className="flex justify-between text-[10px]"><span>Total Qty</span><span>{totalQty}</span></div>
            {inv.totalDiscount > 0 && <div className="flex justify-between text-[10px]"><span>Discount</span><span>-{formatCurrency(inv.totalDiscount)}</span></div>}
            {inv.totalCGST > 0 && <div className="flex justify-between text-[10px]"><span>CGST</span><span>{formatCurrency(inv.totalCGST)}</span></div>}
            {inv.totalSGST > 0 && <div className="flex justify-between text-[10px]"><span>SGST</span><span>{formatCurrency(inv.totalSGST)}</span></div>}
            {inv.totalIGST > 0 && <div className="flex justify-between text-[10px]"><span>IGST</span><span>{formatCurrency(inv.totalIGST)}</span></div>}
            {totalTax > 0 && <div className="flex justify-between text-[10px] font-semibold"><span>Total Tax</span><span>{formatCurrency(totalTax)}</span></div>}
            {((inv.packingCharges || 0) + (inv.shippingCharges || 0)) > 0 && (
              <div className="flex justify-between text-[10px]"><span>Packing &amp; Shipping</span><span>{formatCurrency((inv.packingCharges || 0) + (inv.shippingCharges || 0))}</span></div>
            )}

            <div className="border-b border-dashed border-gray-500 my-2" />
            <div className="flex justify-between text-sm font-bold"><span>Grand Total</span><span>{formatCurrency(inv.grandTotal)}</span></div>
            <div className="border-b border-dashed border-gray-500 my-2" />

            <p className="text-[9px] font-semibold mt-1">Amount in Words:</p>
            <p className="text-[9px] italic text-gray-600">{amountInWords(inv.grandTotal)}</p>

            {invSettings.terms && <p className="text-[9px] text-gray-500 mt-2">{invSettings.terms}</p>}

            <p className="text-center font-bold text-sm mt-3">Thank You!</p>
            <p className="text-center text-[9px] text-gray-400">Visit Again</p>
          </div>
        </div>
      )}
    </div>
  );
}
