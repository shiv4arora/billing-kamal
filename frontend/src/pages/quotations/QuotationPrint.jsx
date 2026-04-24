import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSettings } from '../../context/SettingsContext';
import { api } from '../../hooks/useApi';
import { formatCurrency, formatDate } from '../../utils/helpers';

export default function QuotationPrint() {
  const { id } = useParams();
  const { settings } = useSettings();
  const [q, setQ] = useState(null);

  useEffect(() => { api(`/quotations/${id}`).then(setQ).catch(() => {}); }, [id]);

  if (!q) return <div className="p-8 text-center text-gray-400">Loading…</div>;
  const { company } = settings;
  const items = q.items || [];

  return (
    <>
      <style>{`@media print { .no-print { display: none !important; } body { margin: 0; } } @page { size: A4; margin: 12mm; }`}</style>
      <div className="no-print sticky top-0 bg-gray-900 text-white px-6 py-3 flex items-center gap-4">
        <button onClick={() => window.history.back()} className="text-gray-300 hover:text-white text-sm">← Back</button>
        <span className="text-sm font-medium">{q.quotationNumber}</span>
        <button onClick={() => window.print()} className="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-5 py-2 rounded-lg font-medium">🖨 Print</button>
      </div>
      <div className="max-w-3xl mx-auto p-8 bg-white">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{company.name || 'Company Name'}</h1>
            {company.address && <p className="text-sm text-gray-500 mt-0.5">{company.address}</p>}
            {company.phone && <p className="text-sm text-gray-500">Ph: {company.phone}</p>}
            {company.gstin && <p className="text-sm text-gray-500">GSTIN: {company.gstin}</p>}
          </div>
          <div className="text-right">
            <div className="inline-block bg-indigo-100 border border-indigo-300 rounded-lg px-4 py-2">
              <p className="text-xs text-indigo-600 font-bold uppercase tracking-wide">Estimate</p>
              <p className="text-xl font-bold text-indigo-800 font-mono">{q.quotationNumber}</p>
            </div>
            <div className="mt-2 text-sm text-gray-500 space-y-0.5">
              <p>Date: {formatDate(q.date)}</p>
              {q.validUntil && <p>Valid Until: {formatDate(q.validUntil)}</p>}
            </div>
          </div>
        </div>

        {/* Customer */}
        {q.customerName && (
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">To</p>
              <p className="font-semibold text-gray-800">{q.customerName}</p>
              {q.customerPlace && <p className="text-sm text-gray-500">{q.customerPlace}</p>}
            </div>
          </div>
        )}

        {/* Items */}
        <table className="w-full text-sm mb-6 border-collapse">
          <thead>
            <tr className="bg-indigo-600 text-white text-xs uppercase">
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Rate</th>
              {items.some(i => Number(i.discountPct) > 0) && <th className="px-3 py-2 text-right">Disc%</th>}
              <th className="px-3 py-2 text-right">GST%</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const qty = Number(it.quantity) || 0, price = Number(it.unitPrice) || 0;
              const disc = Number(it.discountPct) || 0, gst = Number(it.gstRate) || 0;
              const sub = qty * price * (1 - disc / 100);
              const total = sub + sub * gst / 100;
              return (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-800">{it.productName}</p>
                    {it.sku && <p className="text-xs text-gray-400 font-mono">{it.sku}</p>}
                  </td>
                  <td className="px-3 py-2 text-right">{qty} {it.unit}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(price)}</td>
                  {items.some(i => Number(i.discountPct) > 0) && <td className="px-3 py-2 text-right">{disc || '—'}</td>}
                  <td className="px-3 py-2 text-right">{gst}%</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-60 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(q.subtotal + q.totalDiscount)}</span></div>
            {q.totalDiscount > 0 && <div className="flex justify-between text-red-600"><span>Discount</span><span>−{formatCurrency(q.totalDiscount)}</span></div>}
            <div className="flex justify-between text-gray-600"><span>GST</span><span>{formatCurrency(q.totalGST)}</span></div>
            <div className="flex justify-between font-bold text-indigo-900 text-base border-t-2 border-indigo-300 pt-1.5"><span>Grand Total</span><span>{formatCurrency(q.grandTotal)}</span></div>
          </div>
        </div>

        {q.notes && (
          <div className="mb-6 bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Terms & Notes</p>
            <p className="text-sm text-gray-600">{q.notes}</p>
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-gray-200 flex justify-between items-end">
          <div className="text-xs text-gray-400">This is a computer-generated quotation.</div>
          <div className="text-center">
            <div className="mt-8 border-t border-gray-400 pt-1 w-36 text-xs text-gray-400">Authorised Signatory</div>
          </div>
        </div>
      </div>
    </>
  );
}
