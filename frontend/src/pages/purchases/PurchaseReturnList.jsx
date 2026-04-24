import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../hooks/useApi';
import { useGlobalToast } from '../../context/ToastContext';
import { formatDate, formatCurrency } from '../../utils/helpers';
import { Button } from '../../components/ui';

export default function PurchaseReturnList() {
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const load = () => {
    api('/purchase-returns').then(setReturns).catch(() => setReturns([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleDelete = async (r) => {
    if (!window.confirm(`Delete Debit Note ${r.returnNumber}? This will reverse all stock and ledger entries.`)) return;
    setDeletingId(r.id);
    try {
      await api(`/purchase-returns/${r.id}`, { method: 'DELETE' });
      toast.success(`${r.returnNumber} deleted`);
      setReturns(prev => prev.filter(x => x.id !== r.id));
    } catch (e) {
      toast.error(e.message || 'Failed to delete');
    } finally { setDeletingId(null); }
  };

  const filtered = returns.filter(r =>
    r.returnNumber?.toLowerCase().includes(search.toLowerCase()) ||
    r.supplierName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Purchase Returns (Debit Notes)</h1>
        <Link to="/purchases/returns/new"><Button>+ New Return</Button></Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : (
        <>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search return #, supplier…"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">↩</p>
              <p className="font-medium">No purchase returns yet</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3 text-left">DR #</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Supplier</th>
                    <th className="px-4 py-3 text-left">Linked Invoice</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-center w-32">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-semibold text-red-600">{r.returnNumber}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(r.date)}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{r.supplierName || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.originalInvoiceNo || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-700">{formatCurrency(r.grandTotal)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center gap-1.5">
                          <button onClick={() => navigate(`/purchases/returns/${r.id}/print`)}
                            className="px-2 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg">🖨</button>
                          <button onClick={() => navigate(`/purchases/returns/${r.id}/edit`)}
                            className="px-2 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">✏️</button>
                          <button onClick={() => handleDelete(r)} disabled={deletingId === r.id}
                            className="px-2 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg disabled:opacity-40">
                            {deletingId === r.id ? '…' : '🗑'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
