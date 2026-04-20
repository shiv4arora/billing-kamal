import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { useSuppliers } from '../../context/SupplierContext';
import { useGlobalToast } from '../../context/ToastContext';
import { api } from '../../hooks/useApi';

const BLANK_ROW = () => ({ name: '', wholesale: '', shop: '', cost: '', qty: '', error: null });

// Auto-estimate cost from wholesale using a margin pct (default 85%)
const estimateCost = (wholesale, marginPct) => {
  const w = parseFloat(wholesale);
  if (!w) return '';
  return String(Math.round(w * (1 - marginPct / 100)));
};

export default function OpeningStock() {
  const navigate = useNavigate();
  const { refresh } = useProducts();
  const { active: suppliers } = useSuppliers();
  const toast = useGlobalToast();

  const [supplierId, setSupplierId] = useState('');
  const [marginPct, setMarginPct] = useState(15); // default 15% margin → cost = 85% of wholesale
  const [rows, setRows] = useState([BLANK_ROW()]);
  const [saving, setSaving] = useState(false);

  const nameRefs = useRef([]);
  const wholesaleRefs = useRef([]);
  const shopRefs = useRef([]);
  const costRefs = useRef([]);
  const qtyRefs = useRef([]);

  const updateRow = (idx, field, value) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [field]: value, error: null };
      // Auto-fill cost when wholesale changes (only if cost hasn't been manually set)
      if (field === 'wholesale' && !r.costEdited) {
        updated.cost = estimateCost(value, marginPct);
      }
      return updated;
    }));
  };

  const updateCost = (idx, value) => {
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, cost: value, costEdited: true, error: null } : r
    ));
  };

  // When margin changes, recalc cost for all rows that haven't been manually edited
  const handleMarginChange = (pct) => {
    setMarginPct(pct);
    setRows(prev => prev.map(r =>
      r.costEdited ? r : { ...r, cost: estimateCost(r.wholesale, pct) }
    ));
  };

  const addRow = (afterIdx) => {
    const insertAt = afterIdx !== undefined ? afterIdx + 1 : rows.length;
    setRows(prev => [...prev.slice(0, insertAt), BLANK_ROW(), ...prev.slice(insertAt)]);
    setTimeout(() => nameRefs.current[insertAt]?.focus(), 30);
  };

  const removeRow = (idx) => {
    if (rows.length === 1) { setRows([BLANK_ROW()]); return; }
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e, idx, field) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const order = ['name', 'wholesale', 'shop', 'cost', 'qty'];
    const nextField = order[order.indexOf(field) + 1];
    if (nextField === 'qty' || nextField === 'cost') {
      const ref = nextField === 'cost' ? costRefs : qtyRefs;
      ref.current[idx]?.focus();
    } else if (nextField) {
      const refs = { name: nameRefs, wholesale: wholesaleRefs, shop: shopRefs };
      refs[nextField]?.current[idx]?.focus();
    } else {
      // last field (qty): go to next row
      if (idx === rows.length - 1) {
        addRow(idx);
      } else {
        nameRefs.current[idx + 1]?.focus();
      }
    }
  };

  const handleSave = async () => {
    const filled = rows.filter(r => r.name.trim());
    if (!filled.length) { toast.error('Add at least one product name'); return; }

    const invalid = filled.filter(r => !r.shop && !r.wholesale);
    if (invalid.length) {
      toast.error('Each product needs at least a Shop price');
      setRows(prev => prev.map(r =>
        r.name.trim() && !r.shop && !r.wholesale ? { ...r, error: 'Shop price required' } : r
      ));
      return;
    }

    setSaving(true);
    try {
      const items = filled.map(r => ({
        name: r.name.trim(),
        wholesale: parseFloat(r.wholesale) || 0,
        shop: parseFloat(r.shop) || parseFloat(r.wholesale) || 0,
        costPrice: parseFloat(r.cost) || 0,
        qty: parseFloat(r.qty) || 0,
        ...(supplierId ? { supplierId } : {}),
      }));

      const res = await api('/products/batch-opening-stock', { method: 'POST', body: { items } });
      await refresh();
      toast.success(`${res.created.length} product${res.created.length > 1 ? 's' : ''} added with SKU & stock`);
      setRows([BLANK_ROW()]);
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const filledCount = rows.filter(r => r.name.trim()).length;

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/products')} className="text-gray-400 hover:text-gray-600">←</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Opening Stock Entry</h1>
          <p className="text-sm text-gray-500 mt-0.5">Add multiple products at once — SKU auto-assigned to each</p>
        </div>
      </div>

      {/* Config row */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-6 items-end">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Supplier (optional)</label>
          <select
            value={supplierId}
            onChange={e => setSupplierId(e.target.value)}
            className="w-56 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">— No supplier —</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.place ? ` (${s.place})` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            Cost Margin %
            <span className="ml-1 text-xs text-gray-400 font-normal">(Cost = Wholesale − this %)</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number" min="0" max="100"
              value={marginPct}
              onChange={e => handleMarginChange(Number(e.target.value))}
              className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-500">%</span>
            <span className="text-xs text-gray-400">(auto-fills Cost column)</span>
          </div>
        </div>
      </div>

      {/* Batch table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <th className="px-3 py-2.5 text-center w-8">#</th>
                <th className="px-3 py-2.5 text-left">Product Name *</th>
                <th className="px-3 py-2.5 text-right w-32">Wholesale (₹)</th>
                <th className="px-3 py-2.5 text-right w-32">Shop Price (₹)</th>
                <th className="px-3 py-2.5 text-right w-32">
                  Cost Price (₹)
                  <span className="ml-1 text-gray-400 normal-case font-normal">est.</span>
                </th>
                <th className="px-3 py-2.5 text-right w-24">Qty</th>
                <th className="px-3 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className={`border-b last:border-0 ${row.error ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                  <td className="px-3 py-1.5 text-center text-xs text-gray-400">{idx + 1}</td>
                  <td className="px-3 py-1.5">
                    <input
                      ref={el => nameRefs.current[idx] = el}
                      value={row.name}
                      onChange={e => updateRow(idx, 'name', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, idx, 'name')}
                      placeholder="Product name…"
                      className={`w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 ${row.error ? 'border-red-300' : 'border-gray-200'}`}
                    />
                    {row.error && <p className="text-xs text-red-500 mt-0.5">{row.error}</p>}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      ref={el => wholesaleRefs.current[idx] = el}
                      type="number" min="0"
                      value={row.wholesale}
                      onChange={e => updateRow(idx, 'wholesale', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, idx, 'wholesale')}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      ref={el => shopRefs.current[idx] = el}
                      type="number" min="0"
                      value={row.shop}
                      onChange={e => updateRow(idx, 'shop', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, idx, 'shop')}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      ref={el => costRefs.current[idx] = el}
                      type="number" min="0"
                      value={row.cost}
                      onChange={e => updateCost(idx, e.target.value)}
                      onKeyDown={e => handleKeyDown(e, idx, 'cost')}
                      placeholder="auto"
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400 bg-amber-50"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      ref={el => qtyRefs.current[idx] = el}
                      type="number" min="0"
                      value={row.qty}
                      onChange={e => updateRow(idx, 'qty', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, idx, 'qty')}
                      placeholder="0"
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <button onClick={() => removeRow(idx)} className="text-gray-300 hover:text-red-500 text-lg leading-none">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={() => addRow(rows.length - 1)}
          className="w-full py-3 border-t border-dashed border-gray-200 text-gray-400 hover:text-blue-500 hover:bg-blue-50 text-sm font-medium transition-colors"
        >
          + Add Row
        </button>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {filledCount > 0 ? `${filledCount} product${filledCount > 1 ? 's' : ''} ready to save` : 'Fill in product details above'}
        </p>
        <div className="flex gap-3">
          <button onClick={() => navigate('/products')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || filledCount === 0}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '⏳ Saving…' : `Save ${filledCount > 0 ? filledCount : ''} Product${filledCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
