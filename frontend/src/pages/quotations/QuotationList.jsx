import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../hooks/useApi';
import { formatDate, formatCurrency } from '../../utils/helpers';
import { Button } from '../../components/ui';

export default function QuotationList() {
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api('/quotations').then(setQuotations).catch(() => setQuotations([])).finally(() => setLoading(false));
  }, []);

  const filtered = quotations.filter(q =>
    q.quotationNumber?.toLowerCase().includes(search.toLowerCase()) ||
    q.customerName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Estimates</h1>
        <Link to="/quotations/new"><Button>+ New Estimate</Button></Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : (
        <>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search QT#, customer…"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">📋</p>
              <p className="font-medium">No estimates yet</p>
              <p className="text-sm mt-1">Create a quick estimate and convert it to an invoice when ready</p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3 text-left">QT #</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Customer</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-center w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(q => (
                    <tr key={q.id} onClick={() => navigate(`/quotations/${q.id}`)} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer">
                      <td className="px-4 py-3 font-mono font-semibold text-indigo-600">{q.quotationNumber}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(q.date)}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{q.customerName || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatCurrency(q.grandTotal)}</td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-center gap-1.5">
                          <button onClick={() => navigate(`/quotations/${q.id}/print`)}
                            className="px-2 py-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg">🖨</button>
                          {!q.convertedToInvoiceId
                            ? <button onClick={() => navigate(`/quotations/${q.id}/edit`)}
                                className="px-2 py-1.5 text-xs text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">✏️</button>
                            : <span className="px-2 py-1 text-xs text-green-700 bg-green-100 rounded-lg font-medium">✓ Invoiced</span>
                          }
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
