import { useParams } from 'react-router-dom';
import { useInvoices } from '../../context/InvoiceContext';
import { useSettings } from '../../context/SettingsContext';
import { formatCurrency, formatDate, amountInWords, formatCustomerDisplay } from '../../utils/helpers';

export default function SaleInvoicePrint() {
  const { id } = useParams();
  const { getSaleInvoice } = useInvoices();
  const { settings } = useSettings();
  const inv = getSaleInvoice(id);

  if (!inv) return <div className="p-8 text-center">Invoice not found.</div>;
  const { company, invoice: invSettings } = settings;
  const items = inv.items || [];
  const hasDiscount = items.some(item => (item.discountPct || 0) > 0);

  return (
    <div className="min-h-screen bg-white">
      <div className="no-print p-4 bg-gray-100 flex gap-3">
        <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded text-sm">🖨 Print / Save PDF</button>
        <button onClick={() => window.history.back()} className="bg-gray-200 px-4 py-2 rounded text-sm">← Back</button>
      </div>

      <div className="p-8 max-w-[210mm] mx-auto text-[13px]">
        {/* Header */}
        <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-gray-800">
          <div>
            {company.logo && <img src={company.logo} alt="logo" className="h-12 mb-2" />}
            <h1 className="text-xl font-bold text-gray-900">{company.name}</h1>
            <p className="text-gray-600 whitespace-pre-line">{company.address}</p>
            {company.phone && <p className="text-gray-600">Ph: {company.phone}</p>}
            {company.gstin && <p className="text-gray-600">GSTIN: {company.gstin}</p>}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">TAX INVOICE</p>
            <p className="text-gray-700 mt-1"><span className="font-semibold">Invoice No:</span> {inv.invoiceNumber}</p>
            <p className="text-gray-700"><span className="font-semibold">Date:</span> {formatDate(inv.date)}</p>
            {inv.dueDate && <p className="text-gray-700"><span className="font-semibold">Due:</span> {formatDate(inv.dueDate)}</p>}
          </div>
        </div>

        {/* Bill To */}
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Bill To</p>
          <p className="font-semibold text-gray-900">
            {formatCustomerDisplay(inv.customerName, inv.customerPlace, inv.customerType)}
          </p>
        </div>

        {/* Items Table */}
        <table className="w-full mb-4 border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-2 py-1.5 text-left">#</th>
              <th className="border border-gray-300 px-2 py-1.5 text-left">Description</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right">Qty</th>
              <th className="border border-gray-300 px-2 py-1.5 text-right">Rate</th>
              {hasDiscount && <th className="border border-gray-300 px-2 py-1.5 text-right">Disc%</th>}
              <th className="border border-gray-300 px-2 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td className="border border-gray-300 px-2 py-1">{i + 1}</td>
                <td className="border border-gray-300 px-2 py-1">
                  {item.productName}
                  {item.sku && <span className="ml-1 text-[10px] text-gray-400 font-mono">[#{item.sku}]</span>}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-right">{item.quantity} {item.unit}</td>
                <td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(item.unitPrice)}</td>
                {hasDiscount && <td className="border border-gray-300 px-2 py-1 text-right">{item.discountPct || 0}%</td>}
                <td className="border border-gray-300 px-2 py-1 text-right font-semibold">{formatCurrency(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold">
              <td colSpan={hasDiscount ? 4 : 3} className="border border-gray-300 px-2 py-1.5 text-right">Total</td>
              {hasDiscount && <td className="border border-gray-300 px-2 py-1.5"></td>}
              <td className="border border-gray-300 px-2 py-1.5 text-right">{formatCurrency(inv.grandTotal)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Summary + Amount in words */}
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-700 mb-1">Amount in Words:</p>
            <p className="text-xs text-gray-600 italic">{amountInWords(inv.grandTotal)}</p>
            {invSettings.bankDetails && (
              <div className="mt-3"><p className="text-xs font-semibold text-gray-700 mb-1">Bank Details:</p><p className="text-xs text-gray-600 whitespace-pre-line">{invSettings.bankDetails}</p></div>
            )}
          </div>
          <div className="w-52 text-xs">
            {inv.totalDiscount > 0 && <div className="flex justify-between py-0.5"><span>Discount</span><span className="text-red-600">-{formatCurrency(inv.totalDiscount)}</span></div>}
            {inv.totalCGST > 0 && <div className="flex justify-between py-0.5"><span>CGST</span><span>{formatCurrency(inv.totalCGST)}</span></div>}
            {inv.totalSGST > 0 && <div className="flex justify-between py-0.5"><span>SGST</span><span>{formatCurrency(inv.totalSGST)}</span></div>}
            {inv.totalIGST > 0 && <div className="flex justify-between py-0.5"><span>IGST</span><span>{formatCurrency(inv.totalIGST)}</span></div>}
            <div className="flex justify-between font-bold text-sm border-t border-gray-400 mt-1 pt-1"><span>Grand Total</span><span>{formatCurrency(inv.grandTotal)}</span></div>
            {(inv.amountPaid || 0) > 0 && (
              <div className="flex justify-between py-0.5 text-green-700"><span>Amount Paid ({inv.paymentMethod})</span><span>{formatCurrency(inv.amountPaid)}</span></div>
            )}
            {(inv.grandTotal - (inv.amountPaid || 0)) > 0.01 && (
              <div className="flex justify-between py-0.5 font-semibold text-red-700"><span>Balance Due</span><span>{formatCurrency(inv.grandTotal - (inv.amountPaid || 0))}</span></div>
            )}
          </div>
        </div>

        {invSettings.terms && <div className="mt-6 pt-4 border-t text-xs text-gray-500"><span className="font-semibold">Terms: </span>{invSettings.terms}</div>}
        <div className="mt-8 flex justify-end"><div className="text-center text-xs text-gray-600"><div className="w-36 border-b border-gray-400 mb-1"></div>Authorised Signatory</div></div>
      </div>
    </div>
  );
}
