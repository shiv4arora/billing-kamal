import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { useGlobalToast } from '../../context/ToastContext';
import { api } from '../../hooks/useApi';
import { formatCurrency } from '../../utils/helpers';

/* ── Product search dropdown (same as ProductionCreate) ── */
function ProductSearch({ value, onSelect, products, placeholder = 'Search product…', exclude = [] }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);

  useEffect(() => { setQ(value || ''); }, [value]);

  const filtered = products
    .filter(p => !exclude.includes(p.id))
    .filter(p =>
      p.name?.toLowerCase().includes(q.toLowerCase()) ||
      p.sku?.toLowerCase().includes(q.toLowerCase())
    )
    .slice(0, 8);

  return (
    <div className="relative">
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-30 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
          {filtered.map(p => (
            <div
              key={p.id}
              onMouseDown={() => { onSelect(p); setQ(p.name); setOpen(false); }}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer"
            >
              <p className="text-sm font-semibold text-gray-800">{p.name}</p>
              <p className="text-xs text-gray-400 font-mono">
                {p.sku} · Stock: {p.currentStock ?? 0} {p.unit}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProductionEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const { active: products, refresh: refreshProducts } = useProducts();

  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState(null);
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [components, setComponents] = useState([]);
  const [outputQuantity, setOutputQuantity] = useState('');
  const [outputWholesale, setOutputWholesale] = useState('');
  const [outputShop, setOutputShop] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api(`/production/${id}`)
      .then(e => {
        setEntry(e);
        setDate(e.date);
        setNotes(e.notes || '');
        setComponents((Array.isArray(e.components) ? e.components : []).map(c => ({
          productId: c.productId,
          productName: c.productName,
          sku: c.sku || '',
          currentStock: products.find(p => p.id === c.productId)?.currentStock ?? 0,
          quantity: c.quantity,
        })));
        setOutputQuantity(e.outputQuantity);
        // Load current pricing from product
        const outProd = products.find(p => p.id === e.outputProductId);
        if (outProd) {
          const pricing = (() => { try { return JSON.parse(outProd.pricing || '{}'); } catch { return {}; } })();
          setOutputWholesale(pricing.wholesale || '');
          setOutputShop(pricing.shop || '');
        }
      })
      .catch(() => toast.error('Could not load entry'))
      .finally(() => setLoading(false));
  }, [id, products.length]);

  const updateComp = (i, field, value) =>
    setComponents(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));

  const selectComponent = (i, prod) => {
    setComponents(prev => prev.map((c, idx) => idx === i ? {
      ...c,
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku || '',
      currentStock: prod.currentStock ?? 0,
    } : c));
  };

  const addComponent = () =>
    setComponents(prev => [...prev, { productId: '', productName: '', sku: '', currentStock: 0, quantity: '' }]);

  const removeComponent = (i) =>
    setComponents(prev => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    const validComps = components.filter(c => c.productId && c.quantity > 0);
    if (!validComps.length) { toast.error('Add at least one component'); return; }
    if (!outputQuantity || Number(outputQuantity) <= 0) { toast.error('Enter output quantity'); return; }

    setSaving(true);
    try {
      await api(`/production/${id}`, {
        method: 'PUT',
        body: {
          date,
          components: validComps.map(c => ({ productId: c.productId, productName: c.productName, sku: c.sku, quantity: Number(c.quantity) })),
          outputQuantity: Number(outputQuantity),
          outputPricing: { wholesale: Number(outputWholesale) || 0, shop: Number(outputShop) || 0 },
          notes,
        },
      });
      await refreshProducts();
      toast.success('Production entry updated');
      navigate('/production');
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-16 text-gray-400">Loading…</div>;
  if (!entry) return <div className="text-center py-16 text-gray-400">Entry not found</div>;

  const usedProductIds = components.filter(c => c.productId).map(c => c.productId);
  const outProd = products.find(p => p.id === entry.outputProductId);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/production')} className="text-gray-400 hover:text-gray-600">←</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit {entry.entryNumber}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Stock will be adjusted by the difference from original quantities</p>
        </div>
      </div>

      {/* Meta */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Notes</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="optional"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Components */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Components Consumed</p>
        </div>
        <div className="divide-y divide-gray-100">
          {components.map((comp, i) => {
            const qty = Number(comp.quantity);
            const overStock = comp.productId && qty > comp.currentStock;
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <ProductSearch
                    value={comp.productName}
                    products={products}
                    exclude={usedProductIds.filter((_, idx) => idx !== i)}
                    onSelect={p => selectComponent(i, p)}
                    placeholder="Search raw material…"
                  />
                  {comp.productId && (
                    <p className={`text-xs mt-0.5 ${overStock ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                      {overStock ? `⚠ Only ${comp.currentStock} in stock` : `Stock: ${comp.currentStock} · SKU: ${comp.sku}`}
                    </p>
                  )}
                </div>
                <div className="w-28 shrink-0">
                  <input
                    type="number" min="0"
                    value={comp.quantity}
                    onChange={e => updateComp(i, 'quantity', e.target.value)}
                    className={`w-full border rounded-lg px-2 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-2 ${overStock ? 'border-red-300 focus:ring-red-400' : 'border-gray-300 focus:ring-blue-500'}`}
                  />
                </div>
                <button onClick={() => removeComponent(i)} className="text-gray-300 hover:text-red-500 text-base shrink-0">✕</button>
              </div>
            );
          })}
        </div>
        <button onClick={addComponent}
          className="w-full py-2.5 border-t border-dashed border-gray-200 text-sm font-medium text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors">
          + Add Component
        </button>
      </div>

      {/* Output */}
      <div className="bg-white border border-blue-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-blue-100 bg-blue-50">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Finished Product</p>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-sm font-semibold text-blue-800">{entry.outputProductName}</span>
            {outProd?.sku && <span className="text-xs font-mono text-blue-500">· {outProd.sku}</span>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Qty Produced *</label>
              <input type="number" min="1" value={outputQuantity} onChange={e => setOutputQuantity(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Wholesale ₹</label>
              <input type="number" min="0" value={outputWholesale} onChange={e => setOutputWholesale(e.target.value)}
                className="w-full border border-blue-200 bg-blue-50 rounded-lg px-2.5 py-1.5 text-sm text-right font-bold text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Shop ₹</label>
              <input type="number" min="0" value={outputShop} onChange={e => setOutputShop(e.target.value)}
                className="w-full border border-purple-200 bg-purple-50 rounded-lg px-2.5 py-1.5 text-sm text-right font-bold text-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pb-10">
        <button onClick={() => navigate('/production')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? '⏳ Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
