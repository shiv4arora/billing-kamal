import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { useSuppliers } from '../../context/SupplierContext';
import { api } from '../../hooks/useApi';
import { formatDate, formatCurrency } from '../../utils/helpers';
import { Button, Modal } from '../../components/ui';
import { UNITS } from '../../constants';

export default function ProductionList() {
  const navigate = useNavigate();
  const { active: products, refresh: refreshProducts } = useProducts();
  const { active: suppliers } = useSuppliers();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showImmediate, setShowImmediate] = useState(false);
  const [ipForm, setIpForm] = useState({ name: '', wholesale: '', unit: 'Pcs', qty: '' });
  const [ipCreating, setIpCreating] = useState(false);
  const [ipList, setIpList] = useState([]);
  const ipNameRef = useRef(null);

  useEffect(() => {
    api('/production')
      .then(data => setEntries(data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  const maliFionna = suppliers.find(s => s.name?.toLowerCase().includes('mali') && s.name?.toLowerCase().includes('fionna'))
    || suppliers.find(s => s.name?.toLowerCase().includes('mali'));

  const createImmediate = async () => {
    if (!ipForm.name.trim()) { ipNameRef.current?.focus(); return; }
    setIpCreating(true);
    try {
      const entry = await api('/production/immediate', {
        method: 'POST',
        body: { name: ipForm.name.trim(), wholesale: +ipForm.wholesale || 0, unit: ipForm.unit, qty: +ipForm.qty || 0, supplierId: maliFionna?.id || null },
      });
      const product = entry.outputs?.[0];
      setIpList(prev => [{ entryNumber: entry.entryNumber, productId: product?.productId, sku: product?.sku, name: product?.productName, wholesale: ipForm.wholesale }, ...prev]);
      setIpForm(f => ({ ...f, name: '', wholesale: '', qty: '' }));
      refreshProducts();
      setTimeout(() => ipNameRef.current?.focus(), 50);
    } catch {
      // fail silently — empty list tells the story
    }
    setIpCreating(false);
  };

  const handleLabels = (e) => {
    const outputs = Array.isArray(e.outputs) && e.outputs.length > 0
      ? e.outputs
      : [{ productId: e.outputProductId, productName: e.outputProductName, quantity: e.outputQuantity, pricing: {}, unit: '' }];
    const items = outputs.map(o => {
      const p = products.find(p => p.id === o.productId);
      const pricing = p
        ? ((typeof p.pricing === 'object' && p.pricing !== null) ? p.pricing : (() => { try { return JSON.parse(p.pricing || '{}'); } catch { return {}; } })())
        : (o.pricing || {});
      return {
        product: { id: o.productId, name: o.productName, sku: p?.sku || o.sku || '', unit: o.unit || p?.unit || '', pricing, supplierId: p?.supplierId || null },
        qty: o.quantity,
      };
    });
    navigate('/labels/bulk', { state: { items } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Production / Assembly</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowImmediate(true); setTimeout(() => ipNameRef.current?.focus(), 80); }}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg"
          >
            ⚡ Immediate
          </button>
          <Link to="/production/new"><Button>+ New Entry</Button></Link>
        </div>
      </div>

      {/* Immediate Production Modal */}
      <Modal open={showImmediate} onClose={() => setShowImmediate(false)} title="⚡ Immediate Production" size="md">
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Creates a new SKU linked to <strong>{maliFionna?.name || 'Mali Fionna'}</strong> — no components needed.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={ipNameRef}
              value={ipForm.name}
              onChange={e => setIpForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && createImmediate()}
              placeholder="Product name *"
              className="flex-1 min-w-[160px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <input
              type="number"
              value={ipForm.wholesale}
              onChange={e => setIpForm(f => ({ ...f, wholesale: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && createImmediate()}
              placeholder="Wholesale ₹"
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <input
              type="number"
              value={ipForm.qty}
              onChange={e => setIpForm(f => ({ ...f, qty: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && createImmediate()}
              placeholder="Qty"
              className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <select
              value={ipForm.unit}
              onChange={e => setIpForm(f => ({ ...f, unit: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            >
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <button
            onClick={createImmediate}
            disabled={ipCreating}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {ipCreating ? 'Creating…' : '+ Create SKU & Add Entry'}
          </button>

          {ipList.length > 0 && (
            <div className="border border-purple-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-purple-50 text-xs font-semibold text-purple-600 uppercase tracking-wide border-b border-purple-100">
                Created this session
              </div>
              {ipList.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5 border-b border-gray-50 last:border-0">
                  <div>
                    <span className="font-mono text-sm font-bold text-purple-700 mr-2">{p.sku}</span>
                    <span className="text-sm text-gray-800">{p.name}</span>
                    {p.wholesale > 0 && <span className="text-xs text-gray-400 ml-2">W: D.No.{Math.round(+p.wholesale * 2)}</span>}
                    <span className="text-xs text-gray-400 ml-2 font-mono">{p.entryNumber}</span>
                  </div>
                  <button
                    onClick={() => navigate(`/products/${p.productId}/label`)}
                    className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap ml-3"
                  >
                    🏷 Print
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

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
                      <button
                        onClick={() => handleLabels(e)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        title="Print labels"
                      >
                        🏷 Labels
                      </button>
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
