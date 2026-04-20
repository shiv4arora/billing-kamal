import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSuppliers } from '../../context/SupplierContext';
import { useGlobalToast } from '../../context/ToastContext';
import { api } from '../../hooks/useApi';
import { today } from '../../utils/helpers';

const BLANK_ROW = () => ({ name: '', wholesale: '', shop: '', cost: '', qty: '', error: null });

const estimateCost = (wholesale, marginPct) => {
  const w = parseFloat(wholesale);
  if (!w) return '';
  return String(Math.round(w * (1 - marginPct / 100)));
};

export default function OpeningStock() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { active: suppliers } = useSuppliers();
  const toast = useGlobalToast();

  const urlSupplierId   = searchParams.get('supplierId')   || '';
  const urlSupplierName = searchParams.get('supplierName') || '';

  const [supplierId,   setSupplierId]   = useState(urlSupplierId);
  const [supplierName, setSupplierName] = useState(urlSupplierName);
  const [billDate,     setBillDate]     = useState(today());
  const [billNo,       setBillNo]       = useState('');
  const [marginPct,    setMarginPct]    = useState(15);
  const [rows,         setRows]         = useState([BLANK_ROW()]);
  const [saving,       setSaving]       = useState(false);

  const nameRefs      = useRef([]);
  const wholesaleRefs = useRef([]);
  const shopRefs      = useRef([]);
  const costRefs      = useRef([]);
  const qtyRefs       = useRef([]);

  const updateRow = (idx, field, value) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const updated = { ...r, [field]: value, error: null };
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
    const refs = { name: wholesaleRefs, wholesale: shopRefs, shop: costRefs, cost: qtyRefs };
    if (field === 'qty') {
      if (idx === rows.length - 1) addRow(idx);
      else nameRefs.current[idx + 1]?.focus();
    } else {
      refs[field]?.current[idx]?.focus();
    }
  };

  const handleSave = async () => {
    const filled = rows.filter(r => r.name.trim());
    if (!filled.length) { toast.error('Add at least one product name'); return; }

    const invalid = filled.filter(r => !r.shop && !r.wholesale);
    if (invalid.length) {
      toast.error('Each product needs at least a Shop or Wholesale price');
      setRows(prev => prev.map(r =>
        r.name.trim() && !r.shop && !r.wholesale ? { ...r, error: 'Price required' } : r
      ));
      return;
    }

    if (!supplierId) { toast.error('Please select a supplier'); return; }

    setSaving(true);
    try {
      const items = filled.map(r => ({
        isNew: true,
        productId: null,
        productName: r.name.trim(),
        unit: 'Pcs',
        quantity: parseFloat(r.qty) || 1,
        unitPrice: parseFloat(r.cost) || parseFloat(r.wholesale) || 0,
        pricing: {
          wholesale: parseFloat(r.wholesale) || 0,
          shop: parseFloat(r.shop) || parseFloat(r.wholesale) || 0,
        },
        gstRate: 0,
        discountPct: 0,
      }));

      const totalCost = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

      const inv = await api('/purchases', {
        method: 'POST',
        body: {
          date: billDate,
          supplierId,
          supplierName,
          supplierInvoiceNumber: billNo || '',
          items,
          grandTotal: totalCost,
          amountPaid: 0,
          paymentMethod: 'credit',
          status: 'draft',
          notes: 'Opening stock entry',
        },
      });

      toast.success(`Purchase bill ${inv.invoiceNumber} created · ${filled.length} products added with SKU & stock`);
      navigate(`/purchases/${inv.id}`);
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const filledCount = rows.filter(r => r.name.trim()).length;
  const totalCost   = rows
    .filter(r => r.name.trim())
    .reduce((s, r) => s + (parseFloat(r.cost) || parseFloat(r.wholesale) || 0) * (parseFloat(r.qty) || 1), 0);

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(urlSupplierId ? '/suppliers' : '/products')} className="text-gray-400 hover:text-gray-600">←</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {urlSupplierName ? `Opening Stock — ${urlSupplierName}` : 'Opening Stock Entry'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Creates a purchase bill · SKU auto-assigned · stock added instantly</p>
        </div>
      </div>

      {/* Bill details */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
        <div className="col-span-2 md:col-span-1">
          <label className="text-sm font-medium text-gray-700 block mb-1">Supplier *</label>
          {urlSupplierId ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm font-medium text-blue-800">
              🏭 {urlSupplierName}
            </div>
          ) : (
            <select
              value={supplierId}
              onChange={e => {
                setSupplierId(e.target.value);
                const s = suppliers.find(s => s.id === e.target.value);
                setSupplierName(s?.name || '');
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">— Select supplier —</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}{s.place ? ` (${s.place})` : ''}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Bill Date</label>
          <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Supplier Bill No. (optional)</label>
          <input type="text" value={billNo} onChange={e => setBillNo(e.target.value)}
            placeholder="e.g. INV-001"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            Cost Margin %
            <span className="ml-1 text-xs text-gray-400 font-normal">auto-fills cost</span>
          </label>
          <input type="number" min="0" max="100" value={marginPct}
            onChange={e => handleMarginChange(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
                <th className="px-3 py-2.5 text-right w-32">Cost Price (₹)</th>
                <th className="px-3 py-2.5 text-right w-24">Qty</th>
                <th className="px-3 py-2.5 text-right w-28">Amount</th>
                <th className="px-3 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const amt = (parseFloat(row.cost) || parseFloat(row.wholesale) || 0) * (parseFloat(row.qty) || 1);
                return (
                  <tr key={idx} className={`border-b last:border-0 ${row.error ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-3 py-1.5 text-center text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-1.5">
                      <input ref={el => nameRefs.current[idx] = el}
                        value={row.name} onChange={e => updateRow(idx, 'name', e.target.value)}
                        onKeyDown={e => handleKeyDown(e, idx, 'name')}
                        placeholder="Product name…"
                        className={`w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 ${row.error ? 'border-red-300' : 'border-gray-200'}`}
                      />
                      {row.error && <p className="text-xs text-red-500 mt-0.5">{row.error}</p>}
                    </td>
                    <td className="px-3 py-1.5">
                      <input ref={el => wholesaleRefs.current[idx] = el}
                        type="number" min="0" value={row.wholesale}
                        onChange={e => updateRow(idx, 'wholesale', e.target.value)}
                        onKeyDown={e => handleKeyDown(e, idx, 'wholesale')}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input ref={el => shopRefs.current[idx] = el}
                        type="number" min="0" value={row.shop}
                        onChange={e => updateRow(idx, 'shop', e.target.value)}
                        onKeyDown={e => handleKeyDown(e, idx, 'shop')}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input ref={el => costRefs.current[idx] = el}
                        type="number" min="0" value={row.cost}
                        onChange={e => updateCost(idx, e.target.value)}
                        onKeyDown={e => handleKeyDown(e, idx, 'cost')}
                        placeholder="auto"
                        className="w-full border border-gray-200 bg-amber-50 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input ref={el => qtyRefs.current[idx] = el}
                        type="number" min="0" value={row.qty}
                        onChange={e => updateRow(idx, 'qty', e.target.value)}
                        onKeyDown={e => handleKeyDown(e, idx, 'qty')}
                        placeholder="1"
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right text-sm font-medium text-gray-700">
                      {row.name.trim() && amt > 0 ? `₹${amt.toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="px-3 py-1.5">
                      <button onClick={() => removeRow(idx)} className="text-gray-300 hover:text-red-500 text-lg leading-none">✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filledCount > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t font-semibold">
                  <td colSpan={6} className="px-3 py-2.5 text-right text-sm text-gray-600">{filledCount} items · Total Stock Value</td>
                  <td className="px-3 py-2.5 text-right text-sm">₹{totalCost.toLocaleString('en-IN')}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <button onClick={() => addRow(rows.length - 1)}
          className="w-full py-3 border-t border-dashed border-gray-200 text-gray-400 hover:text-blue-500 hover:bg-blue-50 text-sm font-medium transition-colors">
          + Add Row
        </button>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {filledCount > 0
            ? `${filledCount} product${filledCount > 1 ? 's' : ''} · Total ₹${totalCost.toLocaleString('en-IN')}`
            : 'Fill in product details above'}
        </p>
        <div className="flex gap-3">
          <button onClick={() => navigate(urlSupplierId ? '/suppliers' : '/products')}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || filledCount === 0}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? '⏳ Creating Bill…' : `Create Purchase Bill (${filledCount} item${filledCount !== 1 ? 's' : ''})`}
          </button>
        </div>
      </div>
    </div>
  );
}
