import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { api } from '../../hooks/useApi';
import { formatDate, formatCurrency } from '../../utils/helpers';
import { Button } from '../../components/ui';

export default function ProductionList() {
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const { active: products } = useProducts();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/production')
      .then(data => setEntries(data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Production / Assembly</h1>
        <Link to="/production/new"><Button>+ New Entry</Button></Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">⚙️</p>
          <p className="font-medium">No production entries yet</p>
          <p className="text-sm mt-1">Combine raw materials into finished products</p>
          <button onClick={() => navigate('/production/new')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium">
            + New Entry
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 text-left">Entry #</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Output Product</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-left">Components</th>
                <th className="px-4 py-3 text-center w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-semibold text-blue-600">{e.entryNumber}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(e.date)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{e.outputProductName}</p>
                    {(() => {
                      const p = products.find(p => p.id === e.outputProductId);
                      const pricing = p ? (
                        (typeof p.pricing === 'object' && p.pricing !== null)
                          ? p.pricing
                          : (() => { try { return JSON.parse(p.pricing || '{}'); } catch { return {}; } })()
                      ) : null;
                      return p ? (
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.sku && <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{p.sku}</span>}
                          {pricing?.wholesale > 0 && <span className="text-xs text-blue-500">W {formatCurrency(pricing.wholesale)}</span>}
                          {pricing?.shop > 0 && <span className="text-xs text-purple-500">S {formatCurrency(pricing.shop)}</span>}
                        </div>
                      ) : null;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{e.outputQuantity}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(e.components) ? e.components : []).map((c, i) => (
                        <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {c.productName} ×{c.quantity}
                        </span>
                      ))}
                    </div>
                    {e.notes && <p className="text-xs text-gray-400 italic mt-0.5">{e.notes}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => navigate(`/production/${e.id}/edit`)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        title="Edit entry"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => navigate(`/products/${e.outputProductId}/label`)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Print labels for output product"
                      >
                        🏷 Label
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
