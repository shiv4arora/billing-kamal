import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { useGlobalToast } from '../../context/ToastContext';
import { api } from '../../hooks/useApi';
import { today, formatCurrency } from '../../utils/helpers';
import { UNITS } from '../../constants';

const BLANK_COMP = () => ({ productId: '', productName: '', sku: '', currentStock: 0, quantity: '' });

/* ── Product search dropdown ── */
function ProductSearch({ value, onSelect, products, placeholder = 'Search product…', exclude = [] }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);

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

export default function ProductionCreate() {
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const { active: products, refresh: refreshProducts } = useProducts();

  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [components, setComponents] = useState([BLANK_COMP()]);

  // Output product
  const [outputIsNew, setOutputIsNew] = useState(false);
  const [outputProductId, setOutputProductId] = useState('');
  const [outputProductName, setOutputProductName] = useState('');
  const [outputUnit, setOutputUnit] = useState('Pcs');
  const [outputQuantity, setOutputQuantity] = useState('');
  const [outputWholesale, setOutputWholesale] = useState('');
  const [outputShop, setOutputShop] = useState('');
  const [nextSku, setNextSku] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/counters').then(d => setNextSku(d.sku ?? 1001)).catch(() => {});
  }, []);

  const addComponent = () => setComponents(prev => [...prev, BLANK_COMP()]);
  const removeComponent = (i) => setComponents(prev => prev.length === 1 ? [BLANK_COMP()] : prev.filter((_, idx) => idx !== i));

  const updateComp = (i, field, value) =>
    setComponents(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));

  const selectComponent = (i, prod) => {
    updateComp(i, 'productId', prod.id);
    updateComp(i, 'productName', prod.name);
    updateComp(i, 'sku', prod.sku || '');
    updateComp(i, 'currentStock', prod.currentStock ?? 0);
  };

  const selectOutput = (prod) => {
    setOutputProductId(prod.id);
    setOutputProductName(prod.name);
    const pricing = (() => { try { return JSON.parse(prod.pricing || '{}'); } catch { return {}; } })();
    setOutputWholesale(pricing.wholesale || '');
    setOutputShop(pricing.shop || '');
  };

  const toggleOutputNew = () => {
    setOutputIsNew(v => !v);
    setOutputProductId('');
    setOutputProductName('');
    setOutputWholesale('');
    setOutputShop('');
  };

  const handleSave = async () => {
    const validComps = components.filter(c => c.productId && c.quantity > 0);
    if (!validComps.length) { toast.error('Add at least one component with quantity'); return; }

    // Check stock
    for (const c of validComps) {
      if (Number(c.quantity) > c.currentStock) {
        toast.error(`Insufficient stock: "${c.productName}" has only ${c.currentStock}`);
        return;
      }
    }
    if (!outputQuantity || Number(outputQuantity) <= 0) { toast.error('Enter quantity produced'); return; }
    if (outputIsNew && !outputProductName.trim()) { toast.error('Enter output product name'); return; }
    if (!outputIsNew && !outputProductId) { toast.error('Select the finished product'); return; }

    setSaving(true);
    try {
      await api('/production', {
        method: 'POST',
        body: {
          date,
          components: validComps.map(c => ({ productId: c.productId, productName: c.productName, sku: c.sku, quantity: Number(c.quantity) })),
          outputProductId: outputIsNew ? null : outputProductId,
          outputProductName: outputProductName.trim(),
          outputIsNew,
          outputQuantity: Number(outputQuantity),
          outputPricing: { wholesale: Number(outputWholesale) || 0, shop: Number(outputShop) || 0 },
          outputUnit,
          notes,
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

  const usedProductIds = components.filter(c => c.productId).map(c => c.productId);

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/production')} className="text-gray-400 hover:text-gray-600">←</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Production Entry</h1>
          <p className="text-sm text-gray-500 mt-0.5">Combine raw materials into a finished product</p>
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
                  <ProductSearch
                    value={comp.productName}
                    products={products}
                    exclude={usedProductIds.filter((_, idx) => idx !== i)}
                    onSelect={p => selectComponent(i, p)}
                    placeholder="Search raw material…"
                  />
                  {comp.productId && (
                    <p className={`text-xs mt-0.5 ${overStock ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                      {overStock
                        ? `⚠ Only ${comp.currentStock} in stock`
                        : `Stock: ${comp.currentStock} · SKU: ${comp.sku}`}
                    </p>
                  )}
                </div>
                <div className="w-28 shrink-0">
                  <input
                    type="number" min="0" step="1"
                    value={comp.quantity}
                    onChange={e => updateComp(i, 'quantity', e.target.value)}
                    placeholder="Qty"
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
        <div className="px-4 py-3 border-b border-blue-100 bg-blue-50 flex items-center justify-between">
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Finished Product (Output)</p>
          <button
            onClick={toggleOutputNew}
            className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${outputIsNew ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600'}`}
          >
            {outputIsNew ? '✦ New Product' : '+ New Product'}
          </button>
        </div>

        <div className="p-4 space-y-3">
          {outputIsNew ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: '2fr 0.8fr 1fr' }}>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Product Name *</label>
                <input
                  value={outputProductName}
                  onChange={e => setOutputProductName(e.target.value)}
                  placeholder="e.g. Boxed Rakhi Set"
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Unit</label>
                <select value={outputUnit} onChange={e => setOutputUnit(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">SKU (auto)</label>
                <div className="flex items-center gap-1.5 border border-blue-200 bg-blue-50 rounded-lg px-2.5 py-1.5">
                  <span className="text-[9px] bg-blue-600 text-white font-bold px-1.5 py-0.5 rounded-full shrink-0">AUTO</span>
                  <span className="text-sm font-mono font-bold text-blue-800">{nextSku ?? '…'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Select Finished Product *</label>
              <ProductSearch
                value={outputProductName}
                products={products}
                onSelect={selectOutput}
                placeholder="Search finished product…"
              />
            </div>
          )}

          {/* Qty + Prices */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Qty Produced *</label>
              <input type="number" min="1" value={outputQuantity} onChange={e => setOutputQuantity(e.target.value)}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Wholesale ₹</label>
              <input type="number" min="0" value={outputWholesale} onChange={e => setOutputWholesale(e.target.value)}
                placeholder="0"
                className="w-full border border-blue-200 bg-blue-50 rounded-lg px-2.5 py-1.5 text-sm text-right font-bold text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Shop ₹</label>
              <input type="number" min="0" value={outputShop} onChange={e => setOutputShop(e.target.value)}
                placeholder="0"
                className="w-full border border-purple-200 bg-purple-50 rounded-lg px-2.5 py-1.5 text-sm text-right font-bold text-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 pb-10">
        <button onClick={() => navigate('/production')}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? '⏳ Saving…' : '⚙️ Produce & Save'}
        </button>
      </div>
    </div>
  );
}
