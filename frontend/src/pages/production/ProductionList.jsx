import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { api } from '../../hooks/useApi';
import { formatDate, formatCurrency } from '../../utils/helpers';
import { Button } from '../../components/ui';

/* ── Quick-label popover ── */
function LabelPopover({ entry, products, onClose }) {
  const navigate = useNavigate();
  const ref = useRef(null);

  const outputs = Array.isArray(entry.outputs) && entry.outputs.length > 0
    ? entry.outputs
    : [{ productId: entry.outputProductId, productName: entry.outputProductName, quantity: entry.outputQuantity, pricing: {}, unit: '' }];

  const [qtys, setQtys] = useState(() => {
    const init = {};
    outputs.forEach(o => { init[o.productId] = 1; });
    return init;
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const setQty = (productId, val) => {
    const n = Math.max(0, Math.min(99, Number(val) || 0));
    setQtys(prev => ({ ...prev, [productId]: n }));
  };

  const printNow = () => {
    const items = outputs
      .filter(o => (qtys[o.productId] || 0) > 0)
      .map(o => {
        const p = products.find(p => p.id === o.productId);
        const pricing = p
          ? ((typeof p.pricing === 'object' && p.pricing !== null) ? p.pricing : (() => { try { return JSON.parse(p.pricing || '{}'); } catch { return {}; } })())
          : (o.pricing || {});
        return {
          product: { id: o.productId, name: o.productName, sku: p?.sku || o.sku || '', unit: o.unit || p?.unit || '', pricing },
          qty: qtys[o.productId] || 0,
        };
      });
    if (!items.length) return;
    onClose();
    navigate('/labels/bulk', { state: { items } });
  };

  const total = Object.values(qtys).reduce((s, n) => s + n, 0);

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[220px]">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Quick Labels</p>
      <div className="space-y-2">
        {outputs.map(o => (
          <div key={o.productId} className="space-y-1">
            <p className="text-xs font-semibold text-gray-700 truncate max-w-[190px]">{o.productName}</p>
            <div className="flex items-center gap-1.5">
              {[1, 2, 5].map(n => (
                <button key={n} onClick={() => setQty(o.productId, n)}
                  className={`px-2 py-1 text-xs font-bold rounded-md border transition-colors ${qtys[o.productId] === n ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-300'}`}>
                  ×{n}
                </button>
              ))}
              <input type="number" min="0" max="99" value={qtys[o.productId]}
                onChange={e => setQty(o.productId, e.target.value)}
                className="w-12 border border-gray-200 rounded-md px-1.5 py-1 text-xs text-center font-semibold focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
          </div>
        ))}
      </div>
      <button onClick={printNow} disabled={total === 0}
        className="mt-3 w-full py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors">
        🖨 Print {total > 0 ? `${total} label${total !== 1 ? 's' : ''}` : 'Now'}
      </button>
    </div>
  );
}

export default function ProductionList() {
  const navigate = useNavigate();
  const { active: products } = useProducts();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openPopover, setOpenPopover] = useState(null); // entryId

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
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 text-left">Entry #</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Output Product</th>
                <th className="px-4 py-3 text-right"></th>
                <th className="px-4 py-3 text-left">Components</th>
                <th className="px-4 py-3 text-left">Box</th>
                <th className="px-4 py-3 text-center w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-semibold text-blue-600">{e.entryNumber}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(e.date)}</td>
                  <td className="px-4 py-3">
                    {(Array.isArray(e.outputs) && e.outputs.length > 0 ? e.outputs : [{ productId: e.outputProductId, productName: e.outputProductName, quantity: e.outputQuantity, pricing: {} }])
                      .map((out, oi) => {
                        const p = products.find(p => p.id === out.productId);
                        const pricing = p
                          ? ((typeof p.pricing === 'object' && p.pricing !== null) ? p.pricing : (() => { try { return JSON.parse(p.pricing || '{}'); } catch { return {}; } })())
                          : (out.pricing || {});
                        return (
                          <div key={oi} className={oi > 0 ? 'mt-1.5 pt-1.5 border-t border-gray-100' : ''}>
                            <p className="font-medium text-gray-800 text-sm">{out.productName}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {p?.sku && <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{p.sku}</span>}
                              <span className="text-xs text-gray-500">×{out.quantity} {out.unit || p?.unit || ''}</span>
                              {pricing?.wholesale > 0 && <span className="text-xs text-blue-500">W {formatCurrency(pricing.wholesale)}</span>}
                              {pricing?.shop > 0 && <span className="text-xs text-purple-500">S {formatCurrency(pricing.shop)}</span>}
                            </div>
                          </div>
                        );
                      })}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-400 text-xs align-top pt-4">
                    {Array.isArray(e.outputs) && e.outputs.length > 1 ? `${e.outputs.length} products` : ''}
                  </td>
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
                  <td className="px-4 py-3 text-sm text-gray-700 align-top">{e.box || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => navigate(`/production/${e.id}/edit`)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        title="Edit entry"
                      >
                        ✏️ Edit
                      </button>
                      <div className="relative">
                        <button
                          onClick={() => setOpenPopover(prev => prev === e.id ? null : e.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Print labels"
                        >
                          🏷 Labels
                        </button>
                        {openPopover === e.id && (
                          <LabelPopover
                            entry={e}
                            products={products}
                            onClose={() => setOpenPopover(null)}
                          />
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
