import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../hooks/useApi';
import { formatDate, formatCurrency } from '../../utils/helpers';
import { Button } from '../../components/ui';

export default function SaleReturnList() {
  const navigate = useNavigate();
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api('/sale-returns').then(setReturns).catch(() => setReturns([])).finally(() => setLoading(false));
  }, []);

  const filtered = returns.filter(r =>
    r.returnNumber?.toLowerCase().includes(search.toLowerCase()) ||
    r.customerName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sale Returns (Credit Notes)</h1>
        <Link to="/sales/returns/new"><Button>+ New Return</Button></Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : (
        <>
          <div className="flex gap-3">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search return #, customer…"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">↩</p>
              <p className="font-medium">No sale returns yet</p>
              <p className="text-sm mt-1">Record customer returns and restore stock</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3 text-left">CR #</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-left">Linked Invoice</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-center w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-semibold text-orange-600">{r.returnNumber}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(r.date)}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{r.customerName || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.originalInvoiceNo || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-orange-700">{formatCurrency(r.grandTotal)}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => navigate(`/sales/returns/${r.id}/print`)}
                          className="px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg">
                          🖨 Print
                        </button>
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
