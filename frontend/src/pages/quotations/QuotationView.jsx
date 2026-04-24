import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useGlobalToast } from '../../context/ToastContext';
import { api } from '../../hooks/useApi';
import { formatDate, formatCurrency } from '../../utils/helpers';

const STATUS_BG = { draft: 'bg-gray-100 text-gray-700', sent: 'bg-blue-100 text-blue-700', accepted: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-600' };

export default function QuotationView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const [q, setQ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api(`/quotations/${id}`).then(setQ).catch(() => toast.error('Could not load quotation')).finally(() => setLoading(false));
  }, [id]);

  const handleStatusChange = async (status) => {
    try {
      const updated = await api(`/quotations/${id}`, { method: 'PUT', body: { ...q, status } });
      setQ({ ...updated, items: updated.items || q.items });
      toast.success(`Status updated to ${status}`);
    } catch (e) { toast.error(e.message || 'Failed'); }
  };

  const handleConvert = async () => {
    setConverting(true);
    try {
      const { invoiceId } = await api(`/quotations/${id}/convert`, { method: 'POST' });
      toast.success('Converted to sale invoice draft');
      navigate(`/sales/${invoiceId}`);
    } catch (e) {
      toast.error(e.message || 'Failed to convert');
      setConverting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api(`/quotations/${id}`, { method: 'DELETE' });
      toast.success('Quotation deleted');
      navigate('/quotations');
    } catch (e) {
      toast.error(e.message || 'Failed');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (loading) return <div className="text-center py-16 text-gray-400">Loading…</div>;
  if (!q) return <div className="text-center py-16 text-gray-400">Quotation not found</div>;

  const items = q.items || [];

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/quotations')} className="text-gray-400 hover:text-gray-600">←</button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 font-mono">{q.quotationNumber}</h1>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BG[q.status] || STATUS_BG.draft}`}>{q.status}</span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{formatDate(q.date)}{q.validUntil ? ` · Valid until ${formatDate(q.validUntil)}` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/quotations/${id}/print`} className="px-3 py-1.5 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg font-medium">🖨 Print</Link>
          {!q.convertedToInvoiceId && (
            <>
              <Link to={`/quotations/${id}/edit`} className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium">✏️ Edit</Link>
              <button onClick={handleConvert} disabled={converting}
                className="px-3 py-1.5 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg font-medium disabled:opacity-50">
                {converting ? '⏳…' : '🧾 Convert to Invoice'}
              </button>
            </>
          )}
          {q.convertedToInvoiceId && (
            <Link to={`/sales/${q.convertedToInvoiceId}`} className="px-3 py-1.5 text-sm text-green-700 bg-green-100 hover:bg-green-200 rounded-lg font-medium">
              🧾 View Invoice →
            </Link>
          )}
        </div>
      </div>

      {/* Status actions */}
      {!q.convertedToInvoiceId && q.status !== 'accepted' && q.status !== 'rejected' && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-500">Update status:</span>
          {q.status !== 'sent' && <button onClick={() => handleStatusChange('sent')} className="px-3 py-1 text-sm text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg">Mark as Sent</button>}
          <button onClick={() => handleStatusChange('accepted')} className="px-3 py-1 text-sm text-green-700 bg-green-100 hover:bg-green-200 rounded-lg">✓ Accepted</button>
          <button onClick={() => handleStatusChange('rejected')} className="px-3 py-1 text-sm text-red-600 bg-red-100 hover:bg-red-200 rounded-lg">✗ Rejected</button>
        </div>
      )}

      {/* Details */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase mb-1">Customer</p>
          <p className="font-semibold text-gray-800">{q.customerName || '—'}</p>
          {q.customerPlace && <p className="text-gray-500">{q.customerPlace}</p>}
        </div>
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase mb-1">Details</p>
          <p className="text-gray-600">Date: {formatDate(q.date)}</p>
          {q.validUntil && <p className="text-gray-600">Valid: {formatDate(q.validUntil)}</p>}
        </div>
        {q.notes && <div className="col-span-2"><p className="text-xs text-gray-400 font-medium uppercase mb-1">Notes</p><p className="text-gray-600 italic">{q.notes}</p></div>}
      </div>

      {/* Items */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">Product</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Rate</th>
              <th className="px-4 py-3 text-right">Disc%</th>
              <th className="px-4 py-3 text-right">GST%</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const qty = Number(it.quantity) || 0, price = Number(it.unitPrice) || 0, disc = Number(it.discountPct) || 0, gst = Number(it.gstRate) || 0;
              const sub = qty * price * (1 - disc / 100);
              const total = sub + sub * gst / 100;
              return (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3"><p className="font-medium">{it.productName}</p>{it.sku && <p className="text-xs text-gray-400 font-mono">{it.sku}</p>}</td>
                  <td className="px-4 py-3 text-right">{qty} {it.unit}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(price)}</td>
                  <td className="px-4 py-3 text-right">{disc || '—'}</td>
                  <td className="px-4 py-3 text-right">{gst}%</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-56 bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(q.subtotal + q.totalDiscount)}</span></div>
          {q.totalDiscount > 0 && <div className="flex justify-between text-red-600"><span>Discount</span><span>−{formatCurrency(q.totalDiscount)}</span></div>}
          <div className="flex justify-between text-gray-600"><span>GST</span><span>{formatCurrency(q.totalGST)}</span></div>
          <div className="flex justify-between font-bold text-indigo-800 text-base border-t border-indigo-200 pt-1.5"><span>Total</span><span>{formatCurrency(q.grandTotal)}</span></div>
        </div>
      </div>

      {/* Delete */}
      {!q.convertedToInvoiceId && (
        <div className="flex justify-start pb-10">
          {confirmDelete ? (
            <span className="flex items-center gap-2">
              <span className="text-sm text-red-600 font-medium">Delete quotation?</span>
              <button onClick={handleDelete} disabled={deleting} className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg font-semibold disabled:opacity-50">{deleting ? '…' : 'Yes, Delete'}</button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg">Cancel</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="px-3 py-1.5 text-sm text-red-500 bg-red-50 hover:bg-red-100 rounded-lg">🗑 Delete</button>
          )}
        </div>
      )}
    </div>
  );
}
