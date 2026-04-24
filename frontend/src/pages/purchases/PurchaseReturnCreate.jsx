import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { useSuppliers } from '../../context/SupplierContext';
import { useGlobalToast } from '../../context/ToastContext';
import { api } from '../../hooks/useApi';
import { today, formatCurrency } from '../../utils/helpers';
import { GST_RATES } from '../../constants';

const BLANK_ITEM = () => ({ productId: '', productName: '', sku: '', unit: 'Pcs', quantity: '', unitPrice: '', gstRate: 0 });

function ProductSearch({ value, onSelect, products, placeholder = 'Search product…' }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  const filtered = products
    .filter(p => p.name?.toLowerCase().includes(q.toLowerCase()) || p.sku?.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8);
  return (
    <div className="relative">
      <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder} className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
      {open && filtered.length > 0 && (
        <div className="absolute z-30 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
          {filtered.map(p => (
            <div key={p.id} onMouseDown={() => { onSelect(p); setQ(p.name); setOpen(false); }} className="px-3 py-2 hover:bg-red-50 cursor-pointer">
              <p className="text-sm font-semibold text-gray-800">{p.name}</p>
              <p className="text-xs text-gray-400 font-mono">{p.sku} · Stock: {p.currentStock ?? 0}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PurchaseReturnCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useGlobalToast();
  const { active: products } = useProducts();
  const { suppliers } = useSuppliers();

  const [date, setDate] = useState(today());
  const [originalInvoiceNo, setOriginalInvoiceNo] = useState(searchParams.get('invoiceNo') || '');
  const [originalInvoiceId, setOriginalInvoiceId] = useState(searchParams.get('invoiceId') || '');
  const [supplierId, setSupplierId] = useState(searchParams.get('supplierId') || '');
  const [supplierName, setSupplierName] = useState(searchParams.get('supplierName') || '');
  const [items, setItems] = useState([BLANK_ITEM()]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const updateItem = (i, field, value) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  const selectProduct = (i, prod) => setItems(prev => prev.map((it, idx) => idx === i ? {
    ...it, productId: prod.id, productName: prod.name, sku: prod.sku || '', unit: prod.unit || 'Pcs', unitPrice: '', gstRate: prod.gstRate || 0,
  } : it));
  const addItem = () => setItems(prev => [...prev, BLANK_ITEM()]);
  const removeItem = (i) => setItems(prev => prev.length === 1 ? [BLANK_ITEM()] : prev.filter((_, idx) => idx !== i));

  const calcLine = (it) => {
    const sub = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
    return { subtotal: sub, gstAmt: sub * (Number(it.gstRate) || 0) / 100, total: sub + sub * (Number(it.gstRate) || 0) / 100 };
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
      const result = await api('/purchase-returns', {
        method: 'POST',
        body: { date, originalInvoiceId, originalInvoiceNo, supplierId: supplierId || null, supplierName, items: validItems, notes },
      });
      toast.success(`Debit Note ${result.returnNumber} created`);
      navigate('/purchases/returns');
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/purchases/returns')} className="text-gray-400 hover:text-gray-600">←</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Purchase Return (Debit Note)</h1>
          <p className="text-sm text-gray-500 mt-0.5">Stock will be reduced for returned items</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Linked Invoice # (optional)</label>
          <input value={originalInvoiceNo} onChange={e => setOriginalInvoiceNo(e.target.value)} placeholder="e.g. PI-0012"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Supplier</label>
          <select value={supplierId} onChange={e => {
            const s = suppliers.find(s => s.id === e.target.value);
            setSupplierId(e.target.value);
            setSupplierName(s?.name || '');
          }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400">
            <option value="">— No supplier —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Notes (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for return"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
      </div>

      <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-red-100 bg-red-50">
          <p className="text-xs font-bold text-red-600 uppercase tracking-widest">Returned Items</p>
        </div>
        <div className="divide-y divide-gray-100">
          {items.map((it, i) => {
            const l = calcLine(it);
            return (
              <div key={i} className="px-4 py-3 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <ProductSearch value={it.productName} products={products} onSelect={p => selectProduct(i, p)} />
                    {it.productId && <p className="text-xs text-gray-400 mt-0.5 font-mono">SKU: {it.sku}</p>}
                  </div>
                  <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 mt-1.5 shrink-0">✕</button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="text-xs text-gray-400 block mb-0.5">Qty</label>
                    <input type="number" min="0" value={it.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-1 focus:ring-red-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-0.5">Unit Price ₹</label>
                    <input type="number" min="0" value={it.unitPrice} onChange={e => updateItem(i, 'unitPrice', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-red-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-0.5">GST %</label>
                    <select value={it.gstRate} onChange={e => updateItem(i, 'gstRate', Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-red-400">
                      {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-0.5">Total</label>
                    <div className="border border-gray-200 bg-gray-50 rounded-lg px-2 py-1.5 text-sm text-right font-semibold">{formatCurrency(l.total)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={addItem} className="w-full py-2.5 border-t border-dashed border-red-200 text-sm font-medium text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
          + Add Item
        </button>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1.5 text-sm">
        <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
        <div className="flex justify-between text-gray-600"><span>GST</span><span>{formatCurrency(totals.gst)}</span></div>
        <div className="flex justify-between font-bold text-red-800 text-base border-t border-red-200 pt-1.5">
          <span>Debit Total</span><span>{formatCurrency(totals.grand)}</span>
        </div>
      </div>

      <div className="flex justify-end gap-3 pb-10">
        <button onClick={() => navigate('/purchases/returns')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50">
          {saving ? '⏳ Saving…' : '↩ Save Debit Note'}
        </button>
      </div>
    </div>
  );
}
