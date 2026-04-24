import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSettings } from '../../context/SettingsContext';
import { api } from '../../hooks/useApi';
import { formatCurrency, formatDate } from '../../utils/helpers';

export default function PurchaseReturnPrint() {
  const { id } = useParams();
  const { settings } = useSettings();
  const [ret, setRet] = useState(null);

  useEffect(() => { api(`/purchase-returns/${id}`).then(setRet).catch(() => {}); }, [id]);

  if (!ret) return <div className="p-8 text-center text-gray-400">Loading…</div>;
  const { company } = settings;
  const items = ret.items || [];

  return (
    <>
      <style>{`@media print { .no-print { display: none !important; } body { margin: 0; } } @page { size: A4; margin: 12mm; }`}</style>
      <div className="no-print sticky top-0 bg-gray-900 text-white px-6 py-3 flex items-center gap-4">
        <button onClick={() => window.history.back()} className="text-gray-300 hover:text-white text-sm">← Back</button>
        <span className="text-sm font-medium">{ret.returnNumber} — Debit Note</span>
        <button onClick={() => window.print()} className="ml-auto bg-red-600 hover:bg-red-700 text-white text-sm px-5 py-2 rounded-lg font-medium">🖨 Print</button>
      </div>
      <div className="max-w-3xl mx-auto p-8 bg-white">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{company.name || 'Company Name'}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{company.address}</p>
            {company.phone && <p className="text-sm text-gray-500">Ph: {company.phone}</p>}
            {company.gstin && <p className="text-sm text-gray-500">GSTIN: {company.gstin}</p>}
          </div>
          <div className="text-right">
            <div className="inline-block bg-red-100 border border-red-300 rounded-lg px-4 py-2">
              <p className="text-xs text-red-600 font-semibold uppercase">Debit Note</p>
              <p className="text-xl font-bold text-red-800 font-mono">{ret.returnNumber}</p>
            </div>
            <p className="text-sm text-gray-500 mt-2">Date: {formatDate(ret.date)}</p>
            {ret.originalInvoiceNo && <p className="text-sm text-gray-500">Against: {ret.originalInvoiceNo}</p>}
          </div>
        </div>
        {ret.supplierName && (
          <div className="bg-gray-50 rounded-lg p-3 mb-6">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Supplier</p>
            <p className="font-semibold text-gray-800">{ret.supplierName}</p>
          </div>
        )}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="bg-gray-100 text-xs text-gray-500 uppercase">
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-right">GST%</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                <td className="px-3 py-2"><p className="font-medium">{it.productName}</p>{it.sku && <p className="text-xs text-gray-400 font-mono">{it.sku}</p>}</td>
                <td className="px-3 py-2 text-right">{it.quantity} {it.unit}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(it.unitPrice)}</td>
                <td className="px-3 py-2 text-right">{it.gstRate}%</td>
                <td className="px-3 py-2 text-right font-semibold">{formatCurrency(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end">
          <div className="w-56 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(ret.subtotal)}</span></div>
            <div className="flex justify-between text-gray-600"><span>GST</span><span>{formatCurrency(ret.totalGST)}</span></div>
            <div className="flex justify-between font-bold text-red-800 text-base border-t border-gray-200 pt-1.5"><span>Debit Total</span><span>{formatCurrency(ret.grandTotal)}</span></div>
          </div>
        </div>
        {ret.notes && <p className="mt-6 text-sm text-gray-500 italic">Note: {ret.notes}</p>}
        <div className="mt-10 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">This is a computer-generated debit note.</div>
      </div>
    </>
  );
}
