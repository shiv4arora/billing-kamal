import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { useCustomers } from '../../context/CustomerContext';
import { useGlobalToast } from '../../context/ToastContext';
import { api } from '../../hooks/useApi';
import { today, formatCurrency } from '../../utils/helpers';
import { GST_RATES } from '../../constants';

const BLANK_ITEM = () => ({ productId: '', productName: '', sku: '', unit: 'Pcs', quantity: '', unitPrice: '', gstRate: 0 });

function ProductSearch({ value, onSelect, products, placeholder = 'Search product…' }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  useEffect(() => { setQ(value || ''); }, [value]);
  const filtered = products
    .filter(p => p.name?.toLowerCase().includes(q.toLowerCase()) || p.sku?.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8);
  return (
    <div className="relative">
      <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder} className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
      {open && filtered.length > 0 && (
        <div className="absolute z-30 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
          {filtered.map(p => (
            <div key={p.id} onMouseDown={() => { onSelect(p); setQ(p.name); setOpen(false); }} className="px-3 py-2 hover:bg-orange-50 cursor-pointer">
              <p className="text-sm font-semibold text-gray-800">{p.name}</p>
              <p className="text-xs text-gray-400 font-mono">{p.sku} · Stock: {p.currentStock ?? 0} {p.unit}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SaleReturnCreate() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useGlobalToast();
  const { active: products } = useProducts();
  const { customers } = useCustomers();

  const [date, setDate] = useState(today());
  const [originalInvoiceNo, setOriginalInvoiceNo] = useState(searchParams.get('invoiceNo') || '');
  const [originalInvoiceId, setOriginalInvoiceId] = useState(searchParams.get('invoiceId') || '');
  const [customerId, setCustomerId] = useState(searchParams.get('customerId') || '');
  const [customerName, setCustomerName] = useState(searchParams.get('customerName') || '');
  const [items, setItems] = useState([BLANK_ITEM()]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) {
      api(`/sale-returns/${id}`).then(r => {
        setDate(r.date);
        setOriginalInvoiceNo(r.originalInvoiceNo || '');
        setOriginalInvoiceId(r.originalInvoiceId || '');
        setCustomerId(r.customerId || '');
        setCustomerName(r.customerName || '');
        setNotes(r.notes || '');
        setItems(r.items?.length ? r.items : [BLANK_ITEM()]);
      }).catch(() => toast.error('Could not load return'));
    }
  }, [id]);

  const updateItem = (i, field, value) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  const selectProduct = (i, prod) => setItems(prev => prev.map((it, idx) => idx === i ? {
    ...it, productId: prod.id, productName: prod.name, sku: prod.sku || '', unit: prod.unit || 'Pcs',
    unitPrice: '', gstRate: prod.gstRate || 0,
  } : it));
  const addItem = () => setItems(prev => [...prev, BLANK_ITEM()]);
  const removeItem = (i) => setItems(prev => prev.length === 1 ? [BLANK_ITEM()] : prev.filter((_, idx) => idx !== i));

  const calcLine = (it) => {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.unitPrice) || 0;
    const gst = Number(it.gstRate) || 0;
    const sub = qty * price;
    return { subtotal: sub, gstAmt: sub * gst / 100, total: sub + sub * gst / 100 };
  };

  const totals = items.reduce((acc, it) => {
    const l = calcLine(it);
    return { subtotal: acc.subtotal + l.subtotal, gst: acc.gst + l.gstAmt, grand: acc.grand + l.total };
  }, { subtotal: 0, gst: 0, grand: 0 });

  const handleSave = async () => {
    const validItems = items.filter(it => it.productId && Number(it.quantity) > 0 && Number(it.unitPrice) > 0);
    if (!validItems.length) { toast.error('Add at least one item with qty and price'); return; }
    setSaving(true);
    try {
      const body = { date, originalInvoiceId, originalInvoiceNo, customerId: customerId || null, customerName, items: validItems, notes };
      const result = isEdit
        ? await api(`/sale-returns/${id}`, { method: 'PUT', body })
        : await api('/sale-returns', { method: 'POST', body });
      toast.success(isEdit ? 'Credit Note updated' : `Credit Note ${result.returnNumber} created`);
      navigate('/sales/returns');
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/sales/returns')} className="text-gray-400 hover:text-gray-600">←</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Sale Return' : 'New Sale Return (Credit Note)'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Stock will be restored for returned items</p>
        </div>
      </div>

      {/* Meta */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Linked Invoice # (optional)</label>
          <input value={originalInvoiceNo} onChange={e => setOriginalInvoiceNo(e.target.value)} placeholder="e.g. SI-0042"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Customer</label>
          <select value={customerId} onChange={e => {
            const c = customers.find(c => c.id === e.target.value);
            setCustomerId(e.target.value);
            setCustomerName(c?.name || '');
          }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
            <option value="">— No customer —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Notes (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for return"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
        </div>
      </div>

      {/* Items */}
      <div className="bg-white border border-orange-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-orange-100 bg-orange-50">
          <p className="text-xs font-bold text-orange-600 uppercase tracking-widest">Returned Items</p>
        </div>
        <div className="divide-y divide-gray-100">
          {items.map((it, i) => {
            const l = calcLine(it);
            return (
              <div key={i} className="px-4 py-3 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <ProductSearch value={it.productName} products={products} onSelect={p => selectProduct(i, p)} placeholder="Search product…" />
                    {it.productId && <p className="text-xs text-gray-400 mt-0.5 font-mono">SKU: {it.sku}</p>}
                  </div>
                  <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 mt-1.5 shrink-0">✕</button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="text-xs text-gray-400 block mb-0.5">Qty</label>
                    <input type="number" min="0" value={it.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-1 focus:ring-orange-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-0.5">Unit Price ₹</label>
                    <input type="number" min="0" value={it.unitPrice} onChange={e => updateItem(i, 'unitPrice', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-orange-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-0.5">GST %</label>
                    <select value={it.gstRate} onChange={e => updateItem(i, 'gstRate', Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-orange-400">
                      {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-0.5">Total</label>
                    <div className="border border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 text-sm text-right font-semibold text-gray-700">
                      {formatCurrency(l.total)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={addItem} className="w-full py-2.5 border-t border-dashed border-orange-200 text-sm font-medium text-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors">
          + Add Item
        </button>
      </div>

      {/* Totals */}
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-1.5 text-sm">
        <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
        <div className="flex justify-between text-gray-600"><span>GST</span><span>{formatCurrency(totals.gst)}</span></div>
        <div className="flex justify-between font-bold text-orange-800 text-base border-t border-orange-200 pt-1.5">
          <span>Credit Total</span><span>{formatCurrency(totals.grand)}</span>
        </div>
      </div>

      <div className="flex justify-end gap-3 pb-10">
        <button onClick={() => navigate('/sales/returns')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 bg-orange-600 text-white text-sm font-semibold rounded-lg hover:bg-orange-700 disabled:opacity-50">
          {saving ? '⏳ Saving…' : isEdit ? '💾 Update Credit Note' : '↩ Save Credit Note'}
        </button>
      </div>
    </div>
  );
}
