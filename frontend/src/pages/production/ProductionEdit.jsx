import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import QuickCalc from '../../components/ui/QuickCalc';
import { useProducts } from '../../context/ProductContext';
import { useSuppliers } from '../../context/SupplierContext';
import { useGlobalToast } from '../../context/ToastContext';
import { api } from '../../hooks/useApi';
import { UNITS } from '../../constants';

const BLANK_OUTPUT = () => ({ isNew: false, productId: '', productName: '', sku: '', currentStock: 0, unit: 'Pcs', quantity: '', wholesale: '', shop: '', supplierId: '' });

/* ── Product search dropdown (position:fixed to escape overflow:hidden) ── */
function ProductSearch({ value, onSelect, products, placeholder = 'Search product…', exclude = [] }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const inputRef = useRef(null);
  useEffect(() => { setQ(value || ''); }, [value]);

  const filtered = products
    .filter(p => !exclude.includes(p.id))
    .filter(p => p.name?.toLowerCase().includes(q.toLowerCase()) || p.sku?.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8);

  const calcPos = () => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: Math.max(rect.width, 280) });
  };

  return (
    <div>
      <input
        ref={inputRef}
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); calcPos(); }}
        onFocus={() => { calcPos(); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
      />
      {open && filtered.length > 0 && pos && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-52 overflow-y-auto">
          {filtered.map(p => (
            <div key={p.id} onMouseDown={e => { e.preventDefault(); onSelect(p); setQ(p.name); setOpen(false); }}
              className="px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{p.name}</p>
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
  const { suppliers } = useSuppliers();

  const [loading, setLoading] = useState(true);
  const [entry, setEntry] = useState(null);
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [box, setBox] = useState('');
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
        setBox(e.box || '');
        setComponents((Array.isArray(e.components) ? e.components : []).map(c => ({
          productId: c.productId, productName: c.productName, sku: c.sku || '', currentStock: 0, unit: '', wholesale: 0, vendorCode: '', quantity: c.quantity,
        })));
        const outs = Array.isArray(e.outputs) && e.outputs.length > 0 ? e.outputs : [];
        setOutputs(outs.map(o => ({
          productId: o.productId, productName: o.productName, sku: o.sku || '', currentStock: 0,
          unit: o.unit || 'Pcs',
          quantity: o.quantity,
          wholesale: o.pricing?.wholesale ?? '', shop: o.pricing?.shop ?? '',
        })));
      })
      .catch(() => toast.error('Could not load entry'))
      .finally(() => setLoading(false));
  }, [id]);

  // Effect 2: fill stock + pricing once products load
  useEffect(() => {
    if (!entry || !products.length) return;
    setComponents(prev => prev.map(c => {
      const prod = products.find(p => p.id === c.productId);
      if (!prod) return c;
      const pricing = (typeof prod.pricing === 'object' && prod.pricing !== null)
        ? prod.pricing
        : (() => { try { return JSON.parse(prod.pricing || '{}'); } catch { return {}; } })();
      return { ...c, currentStock: prod.currentStock ?? 0, unit: prod.unit || '', wholesale: pricing.wholesale || 0, vendorCode: prod.supplier?.code || prod.supplier?.name || '' };
    }));
    setOutputs(prev => prev.map(o => {
      const prod = products.find(p => p.id === o.productId);
      if (!prod) return o;
      const pricing = (typeof prod.pricing === 'object' && prod.pricing !== null)
        ? prod.pricing
        : (() => { try { return JSON.parse(prod.pricing || '{}'); } catch { return {}; } })();
      // Only fill pricing if not already set from the saved entry ('' means nothing was saved)
      return {
        ...o,
        currentStock: prod.currentStock ?? 0,
        unit: o.unit && o.unit !== 'Pcs' ? o.unit : (prod.unit || o.unit || 'Pcs'),
        wholesale: (o.wholesale !== '' && o.wholesale !== null && o.wholesale !== undefined) ? o.wholesale : (pricing.wholesale ?? ''),
        shop:      (o.shop      !== '' && o.shop      !== null && o.shop      !== undefined) ? o.shop      : (pricing.shop      ?? ''),
      };
    }));
  }, [entry?.id, products.length]);

  /* ── Component helpers ── */
  const updateComp = (i, field, value) => setComponents(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  const selectComponent = (i, prod) => {
    const pricing = (typeof prod.pricing === 'object' && prod.pricing !== null)
      ? prod.pricing
      : (() => { try { return JSON.parse(prod.pricing || '{}'); } catch { return {}; } })();
    setComponents(prev => prev.map((c, idx) => idx === i ? {
      ...c, productId: prod.id, productName: prod.name, sku: prod.sku || '',
      currentStock: prod.currentStock ?? 0, unit: prod.unit || '', wholesale: pricing.wholesale || 0,
      vendorCode: prod.supplier?.code || prod.supplier?.name || '',
    } : c));
  };
  const addComponent = () => setComponents(prev => [...prev, { productId: '', productName: '', sku: '', currentStock: 0, unit: '', wholesale: 0, vendorCode: '', quantity: '' }]);
  const removeComponent = (i) => setComponents(prev => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i));

  /* ── Output helpers ── */
  const updateOut = (i, field, value) => setOutputs(prev => prev.map((o, idx) => {
    if (idx !== i) return o;
    // Typing the wholesale rate auto-fills the shop rate at 1.5x (rounded);
    // can still be overridden manually.
    if (field === 'wholesale') {
      const w = parseFloat(value);
      const shop = (value === '' || isNaN(w)) ? '' : String(Math.round(w * 1.5));
      return { ...o, wholesale: value, shop };
    }
    return { ...o, [field]: value };
  }));
  const selectOutput = (i, prod) => {
    const pricing = (typeof prod.pricing === 'object' && prod.pricing !== null)
      ? prod.pricing
      : (() => { try { return JSON.parse(prod.pricing || '{}'); } catch { return {}; } })();
    setOutputs(prev => prev.map((o, idx) => idx === i ? {
      ...o, productId: prod.id, productName: prod.name, sku: prod.sku || '',
      currentStock: prod.currentStock ?? 0, unit: prod.unit || 'Pcs',
      wholesale: pricing.wholesale ?? '', shop: pricing.shop ?? '',
    } : o));
  };
  const addOutput = () => setOutputs(prev => [...prev, BLANK_OUTPUT()]);
  const removeOutput = (i) => setOutputs(prev => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i));
  const toggleOutputNew = (i) => setOutputs(prev => prev.map((o, idx) => idx === i ? { ...BLANK_OUTPUT(), isNew: !o.isNew } : o));

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
    const validOuts = outputs.filter(o => (o.productId || (o.isNew && o.productName?.trim())) && o.quantity > 0);
    if (!validOuts.length) { toast.error('Add at least one finished product'); return; }
    for (const o of validOuts) {
      if (o.isNew && !o.productName?.trim()) { toast.error('Enter name for new product'); return; }
      if (!o.isNew && !o.productId) { toast.error('Select all finished products'); return; }
    }

    setSaving(true);
    try {
      await api(`/production/${id}`, {
        method: 'PUT',
        body: {
          date, notes, box,
          components: validComps.map(c => ({ productId: c.productId, productName: c.productName, sku: c.sku, quantity: Number(c.quantity) })),
          outputs: validOuts.map(o => ({
            isNew: o.isNew || false,
            productId: o.isNew ? null : o.productId,
            productName: o.productName,
            unit: o.unit || 'Pcs',
            supplierId: o.supplierId || null,
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
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Box</label>
          <input type="text" value={box} onChange={e => setBox(e.target.value)} placeholder="e.g. Box A, Box 3"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Quick Calculator */}
      <QuickCalc />

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
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {(comp.sku || comp.vendorCode) && (
                        <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {[comp.sku, comp.vendorCode].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {comp.unit && <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">{comp.unit}</span>}
                      {comp.wholesale > 0 && <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">W ₹{comp.wholesale}</span>}
                      <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full">Stock: {comp.currentStock}</span>
                    </div>
                  )}
                </div>
                <div className="w-28 shrink-0">
                  <input type="number" min="0" value={comp.quantity} onChange={e => updateComp(i, 'quantity', e.target.value)}
                    className={`w-full border rounded-lg px-2 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-2 ${overStock ? 'border-red-300 focus:ring-red-400' : 'border-gray-300 focus:ring-blue-500'}`} />
                  {overStock && <p className="text-xs text-red-500 font-medium text-right mt-0.5">⚠ Only {comp.currentStock}</p>}
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
                  {out.isNew ? (
                    <div className="space-y-1.5">
                      <div className="grid gap-2" style={{ gridTemplateColumns: '2fr 0.8fr' }}>
                        <input value={out.productName} onChange={e => updateOut(i, 'productName', e.target.value)} placeholder="Product name *"
                          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <select value={out.unit} onChange={e => updateOut(i, 'unit', e.target.value)}
                          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </div>
                      <select value={out.supplierId} onChange={e => updateOut(i, 'supplierId', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">— No vendor —</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
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
                    {!out.isNew && out.productId && (
                      <>
                        <span className="text-xs text-gray-400 font-mono">SKU: {out.sku} · Stock: {out.currentStock}</span>
                        {out.unit && <span className="text-xs bg-blue-100 text-blue-700 dark:bg-[rgba(10,132,255,0.15)] dark:text-[#0A84FF] font-medium px-2 py-0.5 rounded-full">{out.unit}</span>}
                      </>
                    )}
                  </div>
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
