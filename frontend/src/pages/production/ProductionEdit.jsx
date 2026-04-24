import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { useGlobalToast } from '../../context/ToastContext';
import { api } from '../../hooks/useApi';

const BLANK_OUTPUT = () => ({ productId: '', productName: '', sku: '', currentStock: 0, quantity: '', wholesale: '', shop: '' });

/* ── Product search dropdown ── */
function ProductSearch({ value, onSelect, products, placeholder = 'Search product…', exclude = [] }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  useEffect(() => { setQ(value || ''); }, [value]);

  const filtered = products
    .filter(p => !exclude.includes(p.id))
    .filter(p => p.name?.toLowerCase().includes(q.toLowerCase()) || p.sku?.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8);

  return (
    <div className="relative">
      <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      {open && filtered.length > 0 && (
        <div className="absolute z-30 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
          {filtered.map(p => (
            <div key={p.id} onMouseDown={() => { onSelect(p); setQ(p.name); setOpen(false); }} className="px-3 py-2 hover:bg-blue-50 cursor-pointer">
              <p className="text-sm font-semibold text-gray-800">{p.name}</p>
              <p className="text-xs text-gray-400 font-mono">{p.sku} · Stock: {p.currentStock ?? 0} {p.unit}</p>
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
  const [outputs, setOutputs] = useState([BLANK_OUTPUT()]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Effect 1: fetch entry
  useEffect(() => {
    api(`/production/${id}`)
      .then(e => {
        setEntry(e);
        setDate(e.date);
        setNotes(e.notes || '');
        setComponents((Array.isArray(e.components) ? e.components : []).map(c => ({
          productId: c.productId, productName: c.productName, sku: c.sku || '', currentStock: 0, quantity: c.quantity,
        })));
        const outs = Array.isArray(e.outputs) && e.outputs.length > 0 ? e.outputs : [];
        setOutputs(outs.map(o => ({
          productId: o.productId, productName: o.productName, sku: o.sku || '', currentStock: 0,
          quantity: o.quantity,
          wholesale: o.pricing?.wholesale || '', shop: o.pricing?.shop || '',
        })));
      })
      .catch(() => toast.error('Could not load entry'))
      .finally(() => setLoading(false));
  }, [id]);

  // Effect 2: fill stock + pricing once products load
  useEffect(() => {
    if (!entry || !products.length) return;
    setComponents(prev => prev.map(c => ({ ...c, currentStock: products.find(p => p.id === c.productId)?.currentStock ?? 0 })));
    setOutputs(prev => prev.map(o => {
      const prod = products.find(p => p.id === o.productId);
      if (!prod) return o;
      const pricing = (typeof prod.pricing === 'object' && prod.pricing !== null)
        ? prod.pricing
        : (() => { try { return JSON.parse(prod.pricing || '{}'); } catch { return {}; } })();
      return { ...o, currentStock: prod.currentStock ?? 0, wholesale: o.wholesale || pricing.wholesale || '', shop: o.shop || pricing.shop || '' };
    }));
  }, [entry?.id, products.length]);

  /* ── Component helpers ── */
  const updateComp = (i, field, value) => setComponents(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  const selectComponent = (i, prod) => setComponents(prev => prev.map((c, idx) => idx === i ? { ...c, productId: prod.id, productName: prod.name, sku: prod.sku || '', currentStock: prod.currentStock ?? 0 } : c));
  const addComponent = () => setComponents(prev => [...prev, { productId: '', productName: '', sku: '', currentStock: 0, quantity: '' }]);
  const removeComponent = (i) => setComponents(prev => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i));

  /* ── Output helpers ── */
  const updateOut = (i, field, value) => setOutputs(prev => prev.map((o, idx) => idx === i ? { ...o, [field]: value } : o));
  const selectOutput = (i, prod) => {
    const pricing = (typeof prod.pricing === 'object' && prod.pricing !== null)
      ? prod.pricing
      : (() => { try { return JSON.parse(prod.pricing || '{}'); } catch { return {}; } })();
    setOutputs(prev => prev.map((o, idx) => idx === i ? {
      ...o, productId: prod.id, productName: prod.name, sku: prod.sku || '', currentStock: prod.currentStock ?? 0,
      wholesale: pricing.wholesale || '', shop: pricing.shop || '',
    } : o));
  };
  const addOutput = () => setOutputs(prev => [...prev, BLANK_OUTPUT()]);
  const removeOutput = (i) => setOutputs(prev => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i));

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api(`/production/${id}`, { method: 'DELETE' });
      await refreshProducts();
      toast.success('Entry deleted and stock reversed');
      navigate('/production');
    } catch (e) {
      toast.error(e.message || 'Failed to delete');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleSave = async () => {
    const validComps = components.filter(c => c.productId && c.quantity > 0);
    if (!validComps.length) { toast.error('Add at least one component'); return; }
    const validOuts = outputs.filter(o => o.productId && o.quantity > 0);
    if (!validOuts.length) { toast.error('Add at least one finished product'); return; }

    setSaving(true);
    try {
      await api(`/production/${id}`, {
        method: 'PUT',
        body: {
          date, notes,
          components: validComps.map(c => ({ productId: c.productId, productName: c.productName, sku: c.sku, quantity: Number(c.quantity) })),
          outputs: validOuts.map(o => ({
            productId: o.productId, productName: o.productName,
            quantity: Number(o.quantity),
            pricing: { wholesale: Number(o.wholesale) || 0, shop: Number(o.shop) || 0 },
          })),
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

  const usedCompIds = components.filter(c => c.productId).map(c => c.productId);
  const usedOutIds = outputs.filter(o => o.productId).map(o => o.productId);

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
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="optional"
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
                  <ProductSearch value={comp.productName} products={products} exclude={usedCompIds.filter((_, idx) => idx !== i)} onSelect={p => selectComponent(i, p)} placeholder="Search raw material…" />
                  {comp.productId && (
                    <p className={`text-xs mt-0.5 ${overStock ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                      {overStock ? `⚠ Only ${comp.currentStock} in stock` : `Stock: ${comp.currentStock} · SKU: ${comp.sku}`}
                    </p>
                  )}
                </div>
                <div className="w-28 shrink-0">
                  <input type="number" min="0" value={comp.quantity} onChange={e => updateComp(i, 'quantity', e.target.value)}
                    className={`w-full border rounded-lg px-2 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-2 ${overStock ? 'border-red-300 focus:ring-red-400' : 'border-gray-300 focus:ring-blue-500'}`} />
                </div>
                <button onClick={() => removeComponent(i)} className="text-gray-300 hover:text-red-500 shrink-0">✕</button>
              </div>
            );
          })}
        </div>
        <button onClick={addComponent} className="w-full py-2.5 border-t border-dashed border-gray-200 text-sm font-medium text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors">
          + Add Component
        </button>
      </div>

      {/* Outputs */}
      <div className="bg-white border border-blue-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-blue-100 bg-blue-50">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Finished Products (Output)</p>
        </div>
        <div className="divide-y divide-blue-50">
          {outputs.map((out, i) => (
            <div key={i} className="px-4 py-3 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <ProductSearch value={out.productName} products={products} exclude={usedOutIds.filter((_, idx) => idx !== i)} onSelect={p => selectOutput(i, p)} placeholder="Search finished product…" />
                  {out.productId && (
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">SKU: {out.sku} · Stock: {out.currentStock}</p>
                  )}
                </div>
                <div className="w-24 shrink-0">
                  <input type="number" min="1" value={out.quantity} onChange={e => updateOut(i, 'quantity', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button onClick={() => removeOutput(i)} className="text-gray-300 hover:text-red-500 shrink-0 mt-1.5">✕</button>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white bg-blue-600 px-1.5 py-0.5 rounded">W</span>
                  <input type="number" min="0" value={out.wholesale} onChange={e => updateOut(i, 'wholesale', e.target.value)} placeholder="Wholesale ₹"
                    className="flex-1 border border-blue-200 bg-blue-50 rounded-lg px-2 py-1.5 text-sm text-right font-bold text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div className="flex-1 flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white bg-purple-500 px-1.5 py-0.5 rounded">S</span>
                  <input type="number" min="0" value={out.shop} onChange={e => updateOut(i, 'shop', e.target.value)} placeholder="Shop ₹"
                    className="flex-1 border border-purple-200 bg-purple-50 rounded-lg px-2 py-1.5 text-sm text-right font-bold text-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addOutput} className="w-full py-2.5 border-t border-dashed border-blue-200 text-sm font-medium text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
          + Add Finished Product
        </button>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pb-10">
        <div>
          {confirmDelete ? (
            <span className="flex items-center gap-2">
              <span className="text-sm text-red-600 font-medium">Delete & reverse stock?</span>
              <button onClick={handleDelete} disabled={deleting}
                className="px-3 py-1.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50">
                {deleting ? '…' : 'Yes, Delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="px-3 py-1.5 text-sm font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg">
              🗑 Delete Entry
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/production')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? '⏳ Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
