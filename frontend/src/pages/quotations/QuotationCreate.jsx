import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { useGlobalToast } from '../../context/ToastContext';
import { api } from '../../hooks/useApi';
import { today, formatCurrency } from '../../utils/helpers';

const BLANK_ITEM = () => ({ productId: '', productName: '', sku: '', unit: '', quantity: 1, unitPrice: 0, discountPct: 0, gstRate: 0 });

export default function QuotationCreate() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const { active: products } = useProducts();
  const qtyRefs = useRef({});

  const [date, setDate] = useState(today());
  const [customerName, setCustomerName] = useState('');
  const [items, setItems] = useState([BLANK_ITEM()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) {
      api(`/quotations/${id}`).then(q => {
        setDate(q.date);
        setCustomerName(q.customerName || '');
        setItems(q.items?.length ? q.items : [BLANK_ITEM()]);
      }).catch(() => toast.error('Could not load estimate'));
    }
  }, [id]);

  const updateItem = (i, field, value) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));

  const handleSkuChange = (i, val) => {
    updateItem(i, 'sku', val);
    const prod = products.find(p => p.sku?.toLowerCase() === val.trim().toLowerCase());
    if (prod) {
      const pricing = (typeof prod.pricing === 'object' && prod.pricing !== null)
        ? prod.pricing
        : (() => { try { return JSON.parse(prod.pricing || '{}'); } catch { return {}; } })();
      setItems(prev => prev.map((it, idx) => idx === i ? {
        ...it, sku: val, productId: prod.id, productName: prod.name,
        unit: prod.unit || '', unitPrice: pricing.wholesale || 0,
      } : it));
      setTimeout(() => qtyRefs.current[i]?.focus(), 50);
    } else {
      setItems(prev => prev.map((it, idx) => idx === i ? { ...it, sku: val, productId: '', productName: '' } : it));
    }
  };

  const removeItem = (i) => setItems(prev => prev.length === 1 ? [BLANK_ITEM()] : prev.filter((_, idx) => idx !== i));

  const calcTotal = (it) => (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);

  const grand = items.reduce((s, it) => s + calcTotal(it), 0);

  const handleSave = async () => {
    const validItems = items.filter(it => it.productId && Number(it.quantity) > 0);
    if (!validItems.length) { toast.error('Add at least one valid item (match SKU to a product)'); return; }
    setSaving(true);
    try {
      const body = {
        date, customerName, customerPlace: '', customerId: null, customerType: 'retail',
        validUntil: '', notes: '', items: validItems,
        subtotal: grand, totalDiscount: 0, totalGST: 0, grandTotal: grand,
      };
      const result = isEdit
        ? await api(`/quotations/${id}`, { method: 'PUT', body })
        : await api('/quotations', { method: 'POST', body });
      toast.success(isEdit ? 'Estimate updated' : `Estimate ${result.quotationNumber} created`);
      navigate(`/quotations/${result.id}`);
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/quotations')} className="text-gray-400 hover:text-gray-600">←</button>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Estimate' : 'New Estimate'}</h1>
      </div>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex gap-4">
        <div className="w-40 shrink-0">
          <label className="text-xs font-medium text-gray-500 block mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium text-gray-500 block mb-1">Customer Name (optional)</label>
          <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. Rahul Sharma"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      {/* Items */}
      <div className="space-y-3">
        {items.map((it, i) => {
          const total = calcTotal(it);
          const matched = !!it.productId;
          return (
            <div key={i} className={`bg-white border rounded-xl p-4 ${matched ? 'border-indigo-200' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Item {i + 1}</span>
                <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 text-sm">✕</button>
              </div>

              {/* SKU row */}
              <div className="mb-3">
                <label className="text-xs font-medium text-gray-500 block mb-1">SKU ID</label>
                <input
                  value={it.sku}
                  onChange={e => handleSkuChange(i, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); qtyRefs.current[i]?.focus(); } }}
                  placeholder="Type SKU and press Enter…"
                  className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 ${matched ? 'border-indigo-300 bg-indigo-50 focus:ring-indigo-400' : 'border-gray-300 focus:ring-indigo-400'}`}
                />
                {matched && (
                  <p className="text-xs text-indigo-600 font-medium mt-1">✓ {it.productName}{it.unit ? ` · ${it.unit}` : ''}</p>
                )}
                {it.sku && !matched && (
                  <p className="text-xs text-red-400 mt-1">No product found for this SKU</p>
                )}
              </div>

              {/* Qty + Rate + Total */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Qty</label>
                  <input
                    ref={el => qtyRefs.current[i] = el}
                    type="number" min="0" value={it.quantity}
                    onChange={e => updateItem(i, 'quantity', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Rate ₹</label>
                  <input
                    type="number" min="0" value={it.unitPrice}
                    onChange={e => updateItem(i, 'unitPrice', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Total</label>
                  <div className={`border rounded-lg px-3 py-2 text-sm text-right font-bold ${total > 0 ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>
                    {total > 0 ? formatCurrency(total) : '—'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <button
          onClick={() => setItems(prev => [...prev, BLANK_ITEM()])}
          className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-400 hover:text-indigo-500 hover:border-indigo-300 transition-colors"
        >
          + Add Item
        </button>
      </div>

      {/* Grand Total */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
        <div className="flex justify-between font-bold text-indigo-800 text-lg">
          <span>Total</span><span>{formatCurrency(grand)}</span>
        </div>
      </div>

      <div className="flex justify-end gap-3 pb-10">
        <button onClick={() => navigate('/quotations')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {saving ? '⏳ Saving…' : isEdit ? '💾 Update' : '📋 Save Estimate'}
        </button>
      </div>
    </div>
  );
}
