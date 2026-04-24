import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { useGlobalToast } from '../../context/ToastContext';
import { api } from '../../hooks/useApi';
import { today } from '../../utils/helpers';
import { UNITS } from '../../constants';

const BLANK_COMP = () => ({ productId: '', productName: '', sku: '', currentStock: 0, unit: '', wholesale: 0, quantity: '' });
const BLANK_OUTPUT = () => ({ isNew: false, productId: '', productName: '', sku: '', currentStock: 0, unit: 'Pcs', quantity: '', wholesale: '', shop: '' });

/* ── Shared product search dropdown ── */
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

export default function ProductionCreate() {
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const { active: products, refresh: refreshProducts } = useProducts();

  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [components, setComponents] = useState([BLANK_COMP()]);
  const [outputs, setOutputs] = useState([BLANK_OUTPUT()]);
  const [nextSku, setNextSku] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/counters').then(d => setNextSku(d.sku ?? 1001)).catch(() => {});
  }, []);

  /* ── Component helpers ── */
  const addComponent = () => setComponents(prev => [...prev, BLANK_COMP()]);
  const removeComponent = (i) => setComponents(prev => prev.length === 1 ? [BLANK_COMP()] : prev.filter((_, idx) => idx !== i));
  const updateComp = (i, field, value) => setComponents(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  const selectComponent = (i, prod) => {
    const pricing = (typeof prod.pricing === 'object' && prod.pricing !== null)
      ? prod.pricing
      : (() => { try { return JSON.parse(prod.pricing || '{}'); } catch { return {}; } })();
    setComponents(prev => prev.map((c, idx) => idx === i ? {
      ...c, productId: prod.id, productName: prod.name, sku: prod.sku || '',
      currentStock: prod.currentStock ?? 0, unit: prod.unit || '', wholesale: pricing.wholesale || 0,
    } : c));
  };

  /* ── Output helpers ── */
  const addOutput = () => setOutputs(prev => [...prev, BLANK_OUTPUT()]);
  const removeOutput = (i) => setOutputs(prev => prev.length === 1 ? [BLANK_OUTPUT()] : prev.filter((_, idx) => idx !== i));
  const updateOut = (i, field, value) => setOutputs(prev => prev.map((o, idx) => idx === i ? { ...o, [field]: value } : o));
  const selectOutput = (i, prod) => {
    const pricing = (typeof prod.pricing === 'object' && prod.pricing !== null)
      ? prod.pricing
      : (() => { try { return JSON.parse(prod.pricing || '{}'); } catch { return {}; } })();
    setOutputs(prev => prev.map((o, idx) => idx === i ? {
      ...o, productId: prod.id, productName: prod.name, sku: prod.sku || '',
      currentStock: prod.currentStock ?? 0,
      wholesale: pricing.wholesale || '', shop: pricing.shop || '',
    } : o));
  };
  const toggleOutputNew = (i) => setOutputs(prev => prev.map((o, idx) => idx === i ? { ...BLANK_OUTPUT(), isNew: !o.isNew } : o));

  const handleSave = async () => {
    const validComps = components.filter(c => c.productId && c.quantity > 0);
    if (!validComps.length) { toast.error('Add at least one component with quantity'); return; }
    for (const c of validComps) {
      if (Number(c.quantity) > c.currentStock) { toast.error(`Insufficient stock: "${c.productName}" has only ${c.currentStock}`); return; }
    }
    const validOuts = outputs.filter(o => (o.productId || (o.isNew && o.productName.trim())) && o.quantity > 0);
    if (!validOuts.length) { toast.error('Add at least one finished product with quantity'); return; }
    for (const o of validOuts) {
      if (o.isNew && !o.productName.trim()) { toast.error('Enter name for new product'); return; }
      if (!o.isNew && !o.productId) { toast.error('Select all finished products'); return; }
    }

    setSaving(true);
    try {
      await api('/production', {
        method: 'POST',
        body: {
          date, notes,
          components: validComps.map(c => ({ productId: c.productId, productName: c.productName, sku: c.sku, quantity: Number(c.quantity) })),
          outputs: validOuts.map(o => ({
            isNew: o.isNew,
            productId: o.isNew ? null : o.productId,
            productName: o.productName.trim(),
            unit: o.unit,
            quantity: Number(o.quantity),
            pricing: { wholesale: Number(o.wholesale) || 0, shop: Number(o.shop) || 0 },
          })),
        },
      });
      await refreshProducts();
      toast.success('Production entry saved · stock updated');
      navigate('/production');
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const usedCompIds = components.filter(c => c.productId).map(c => c.productId);
  const usedOutIds = outputs.filter(o => o.productId).map(o => o.productId);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/production')} className="text-gray-400 hover:text-gray-600">←</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Production Entry</h1>
          <p className="text-sm text-gray-500 mt-0.5">Combine raw materials into finished products</p>
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
          <label className="text-xs font-medium text-gray-500 block mb-1">Notes (optional)</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Batch 1 Rakhi packing"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Components */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Components Consumed (Raw Materials)</p>
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
                      {overStock
                        ? `⚠ Only ${comp.currentStock} ${comp.unit} in stock`
                        : `Stock: ${comp.currentStock} ${comp.unit} · SKU: ${comp.sku}${comp.wholesale ? ` · W: ₹${comp.wholesale}` : ''}`}
                    </p>
                  )}
                </div>
                <div className="w-28 shrink-0">
                  <input type="number" min="0" value={comp.quantity} onChange={e => updateComp(i, 'quantity', e.target.value)} placeholder="Qty"
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
              {/* Row 1: product + qty + remove */}
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {out.isNew ? (
                    <div className="grid gap-2" style={{ gridTemplateColumns: '2fr 0.8fr' }}>
                      <input value={out.productName} onChange={e => updateOut(i, 'productName', e.target.value)} placeholder="Product name *"
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <select value={out.unit} onChange={e => updateOut(i, 'unit', e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {UNITS.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                  ) : (
                    <ProductSearch value={out.productName} products={products} exclude={usedOutIds.filter((_, idx) => idx !== i)} onSelect={p => selectOutput(i, p)} placeholder="Search finished product…" />
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <button onClick={() => toggleOutputNew(i)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border transition-colors ${out.isNew ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-600'}`}>
                      {out.isNew ? '✦ New Product' : '+ New Product'}
                    </button>
                    {out.isNew && nextSku && (
                      <span className="text-xs text-blue-500 font-mono">SKU: {nextSku + i}</span>
                    )}
                    {!out.isNew && out.productId && (
                      <span className="text-xs text-gray-400 font-mono">SKU: {out.sku} · Stock: {out.currentStock}</span>
                    )}
                  </div>
                </div>
                <div className="w-24 shrink-0">
                  <input type="number" min="1" value={out.quantity} onChange={e => updateOut(i, 'quantity', e.target.value)} placeholder="Qty"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button onClick={() => removeOutput(i)} className="text-gray-300 hover:text-red-500 shrink-0 mt-1.5">✕</button>
              </div>
              {/* Row 2: pricing */}
              <div className="flex gap-2 pl-0">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white bg-blue-600 px-1.5 py-0.5 rounded">W</span>
                    <input type="number" min="0" value={out.wholesale} onChange={e => updateOut(i, 'wholesale', e.target.value)} placeholder="Wholesale ₹"
                      className="flex-1 border border-blue-200 bg-blue-50 rounded-lg px-2 py-1.5 text-sm text-right font-bold text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white bg-purple-500 px-1.5 py-0.5 rounded">S</span>
                    <input type="number" min="0" value={out.shop} onChange={e => updateOut(i, 'shop', e.target.value)} placeholder="Shop ₹"
                      className="flex-1 border border-purple-200 bg-purple-50 rounded-lg px-2 py-1.5 text-sm text-right font-bold text-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  </div>
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
      <div className="flex items-center justify-end gap-3 pb-10">
        <button onClick={() => navigate('/production')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? '⏳ Saving…' : '⚙️ Produce & Save'}
        </button>
      </div>
    </div>
  );
}
