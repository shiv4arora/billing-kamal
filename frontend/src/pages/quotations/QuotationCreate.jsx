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

  const skuRefs = useRef({});
  const qtyRefs = useRef({});
  const rateRefs = useRef({});

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

  const updateItem = (i, field, value) =>
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));

  const handleSkuChange = (i, val) => {
    const prod = products.find(p => p.sku?.toLowerCase() === val.trim().toLowerCase());
    if (prod) {
      const pricing = (typeof prod.pricing === 'object' && prod.pricing !== null)
        ? prod.pricing
        : (() => { try { return JSON.parse(prod.pricing || '{}'); } catch { return {}; } })();
      setItems(prev => prev.map((it, idx) => idx === i ? {
        ...it, sku: val, productId: prod.id, productName: prod.name,
        unit: prod.unit || '', unitPrice: pricing.wholesale || 0,
      } : it));
      setTimeout(() => { qtyRefs.current[i]?.focus(); qtyRefs.current[i]?.select(); }, 50);
    } else {
      setItems(prev => prev.map((it, idx) => idx === i ? { ...it, sku: val, productId: '', productName: '' } : it));
    }
  };

  // Jump to next item's SKU — create new row if at end
  const jumpToNext = (i) => {
    const nextIdx = i + 1;
    if (nextIdx >= items.length) {
      setItems(prev => [...prev, BLANK_ITEM()]);
      setTimeout(() => skuRefs.current[nextIdx]?.focus(), 60);
    } else {
      skuRefs.current[nextIdx]?.focus();
    }
  };

  const removeItem = (i) =>
    setItems(prev => prev.length === 1 ? [BLANK_ITEM()] : prev.filter((_, idx) => idx !== i));

  const calcTotal = (it) => (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
  const grand = items.reduce((s, it) => s + calcTotal(it), 0);

  const handleSave = async () => {
    const validItems = items.filter(it => it.productId && Number(it.quantity) > 0);
    if (!validItems.length) { toast.error('Add at least one valid item'); return; }
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
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/quotations')} className="text-gray-400 hover:text-gray-600">←</button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{isEdit ? 'Edit Estimate' : 'New Estimate'}</h1>
      </div>

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex gap-4">
        <div className="w-40 shrink-0">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white" />
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Customer Name (optional)</label>
          <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. Rahul Sharma"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400" />
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {/* Column headers */}
        <div className="grid items-center bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"
          style={{ gridTemplateColumns: '2rem 8rem 1fr 5rem 6rem 6rem 2rem' }}>
          <span>#</span>
          <span>SKU</span>
          <span>Product</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Rate ₹</span>
          <span className="text-right">Total</span>
          <span />
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {items.map((it, i) => {
            const total = calcTotal(it);
            const matched = !!it.productId;
            return (
              <div key={i}
                className={`grid items-center px-3 py-2 gap-2 ${matched ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : ''}`}
                style={{ gridTemplateColumns: '2rem 8rem 1fr 5rem 6rem 6rem 2rem' }}>

                {/* # */}
                <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{i + 1}</span>

                {/* SKU */}
                <input
                  ref={el => skuRefs.current[i] = el}
                  value={it.sku}
                  onChange={e => handleSkuChange(i, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); qtyRefs.current[i]?.focus(); qtyRefs.current[i]?.select(); } }}
                  placeholder="SKU…"
                  className={`w-full border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 ${
                    matched ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 focus:ring-indigo-400'
                            : it.sku ? 'border-red-300 dark:border-red-700 focus:ring-red-300'
                            : 'border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 focus:ring-indigo-400'
                  }`}
                />

                {/* Product name */}
                <span className={`text-sm truncate ${matched ? 'text-indigo-700 dark:text-indigo-300 font-medium' : 'text-gray-400 dark:text-gray-500 italic'}`}>
                  {matched ? `${it.productName}${it.unit ? ` · ${it.unit}` : ''}` : it.sku && !matched ? '✗ Not found' : '—'}
                </span>

                {/* Qty */}
                <input
                  ref={el => qtyRefs.current[i] = el}
                  type="number" min="0" value={it.quantity}
                  onChange={e => updateItem(i, 'quantity', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); rateRefs.current[i]?.focus(); rateRefs.current[i]?.select(); } }}
                  onWheel={e => e.target.blur()}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                />

                {/* Rate */}
                <input
                  ref={el => rateRefs.current[i] = el}
                  type="number" min="0" value={it.unitPrice}
                  onChange={e => updateItem(i, 'unitPrice', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); jumpToNext(i); } }}
                  onWheel={e => e.target.blur()}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:bg-gray-700 dark:text-gray-100"
                />

                {/* Total */}
                <span className={`text-sm text-right font-bold ${total > 0 ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-300 dark:text-gray-600'}`}>
                  {total > 0 ? formatCurrency(total) : '—'}
                </span>

                {/* Remove */}
                <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-center">✕</button>
              </div>
            );
          })}
        </div>

        {/* Add row */}
        <button
          onClick={() => { setItems(prev => [...prev, BLANK_ITEM()]); setTimeout(() => skuRefs.current[items.length]?.focus(), 60); }}
          className="w-full py-2.5 border-t border-dashed border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-colors"
        >
          + Add Row  <span className="text-xs text-gray-300 dark:text-gray-600 ml-1">(or press Enter on Rate)</span>
        </button>
      </div>

      {/* Grand Total */}
      <div className="flex justify-end">
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl px-6 py-3 flex items-center gap-8">
          <span className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">{items.filter(it => it.productId).length} items</span>
          <div className="flex items-center gap-3 font-bold text-indigo-800 dark:text-indigo-300 text-lg">
            <span>Total</span><span>{formatCurrency(grand)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pb-10">
        <button onClick={() => navigate('/quotations')} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {saving ? '⏳ Saving…' : isEdit ? '💾 Update' : '📋 Save Estimate'}
        </button>
      </div>
    </div>
  );
}
