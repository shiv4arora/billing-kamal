import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { useCustomers } from '../../context/CustomerContext';
import { useGlobalToast } from '../../context/ToastContext';
import { api } from '../../hooks/useApi';
import { today, formatCurrency, getPrice } from '../../utils/helpers';
import { GST_RATES } from '../../constants';

const BLANK_ITEM = () => ({ productId: '', productName: '', sku: '', unit: 'Pcs', quantity: 1, unitPrice: 0, discountPct: 0, gstRate: 0 });

function CustomerSearch({ value, onChange, customers, onSelect }) {
  const [open, setOpen] = useState(false);
  const filtered = customers.filter(c => c.name.toLowerCase().includes(value.toLowerCase())).slice(0, 8);
  return (
    <div className="relative">
      <input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search customer…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      {open && filtered.length > 0 && (
        <div className="absolute z-30 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
          {filtered.map(c => (
            <div key={c.id} onMouseDown={() => { onSelect(c); setOpen(false); }} className="px-3 py-2 hover:bg-indigo-50 cursor-pointer">
              <p className="text-sm font-semibold">{c.name}</p>
              <p className="text-xs text-gray-400">{c.place}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductSearch({ value, onSelect, products, placeholder }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  useEffect(() => { setQ(value || ''); }, [value]);
  const filtered = products.filter(p => p.name?.toLowerCase().includes(q.toLowerCase()) || p.sku?.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  return (
    <div className="relative">
      <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || 'Search product…'} className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
      {open && filtered.length > 0 && (
        <div className="absolute z-30 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
          {filtered.map(p => (
            <div key={p.id} onMouseDown={() => { onSelect(p); setQ(p.name); setOpen(false); }} className="px-3 py-2 hover:bg-indigo-50 cursor-pointer">
              <p className="text-sm font-semibold">{p.name}</p>
              <p className="text-xs text-gray-400 font-mono">{p.sku}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function QuotationCreate() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const { active: products } = useProducts();
  const { active: customers } = useCustomers();

  const [date, setDate] = useState(today());
  const [validUntil, setValidUntil] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPlace, setCustomerPlace] = useState('');
  const [customerType, setCustomerType] = useState('retail');
  const [items, setItems] = useState([BLANK_ITEM()]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit) {
      api(`/quotations/${id}`).then(q => {
        setDate(q.date);
        setValidUntil(q.validUntil || '');
        setCustomerId(q.customerId || '');
        setCustomerName(q.customerName || '');
        setCustomerSearch(q.customerName || '');
        setCustomerPlace(q.customerPlace || '');
        setCustomerType(q.customerType || 'retail');
        setItems(q.items?.length ? q.items : [BLANK_ITEM()]);
        setNotes(q.notes || '');
      }).catch(() => toast.error('Could not load quotation'));
    }
  }, [id]);

  const selectCustomer = (c) => {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerSearch(c.name);
    setCustomerPlace(c.place || '');
    setCustomerType(c.type || 'retail');
    // Update item prices for customer type
    setItems(prev => prev.map(item => {
      if (!item.productId) return item;
      const prod = products.find(p => p.id === item.productId);
      return prod ? { ...item, unitPrice: getPrice(prod, c.type || 'retail') } : item;
    }));
  };

  const updateItem = (i, field, value) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  const selectProduct = (i, prod) => {
    const price = getPrice(prod, customerType);
    setItems(prev => {
      const updated = prev.map((it, idx) => idx === i ? {
        ...it, productId: prod.id, productName: prod.name, sku: prod.sku || '',
        unit: prod.unit || 'Pcs', unitPrice: price, gstRate: prod.gstRate || 0,
      } : it);
      if (i === prev.length - 1) return [...updated, BLANK_ITEM()];
      return updated;
    });
  };
  const removeItem = (i) => setItems(prev => prev.length === 1 ? [BLANK_ITEM()] : prev.filter((_, idx) => idx !== i));

  const calcLine = (it) => {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.unitPrice) || 0;
    const disc = Number(it.discountPct) || 0;
    const gst = Number(it.gstRate) || 0;
    const sub = qty * price;
    const discAmt = sub * disc / 100;
    const taxable = sub - discAmt;
    return { subtotal: taxable, gstAmt: taxable * gst / 100, total: taxable + taxable * gst / 100, discAmt };
  };

  const totals = items.reduce((acc, it) => {
    const l = calcLine(it);
    return { subtotal: acc.subtotal + l.subtotal, discount: acc.discount + l.discAmt, gst: acc.gst + l.gstAmt, grand: acc.grand + l.total };
  }, { subtotal: 0, discount: 0, gst: 0, grand: 0 });

  const handleSave = async () => {
    const validItems = items.filter(it => it.productId && Number(it.quantity) > 0);
    if (!validItems.length) { toast.error('Add at least one item'); return; }
    setSaving(true);
    try {
      const body = {
        date, validUntil, customerId: customerId || null,
        customerName, customerPlace, customerType, notes,
        items: validItems,
        subtotal: totals.subtotal, totalDiscount: totals.discount,
        totalGST: totals.gst, grandTotal: totals.grand,
      };
      const result = isEdit
        ? await api(`/quotations/${id}`, { method: 'PUT', body })
        : await api('/quotations', { method: 'POST', body });
      toast.success(isEdit ? 'Quotation updated' : `Quotation ${result.quotationNumber} created`);
      navigate(`/quotations/${result.id}`);
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/quotations')} className="text-gray-400 hover:text-gray-600">←</button>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Quotation' : 'New Quotation'}</h1>
      </div>

      {/* Meta */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Valid Until</label>
          <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-500 block mb-1">Customer (optional)</label>
          <CustomerSearch value={customerSearch} onChange={setCustomerSearch} customers={customers} onSelect={selectCustomer} />
          {customerId && <p className="text-xs text-indigo-500 mt-0.5">{customerPlace} · {customerType}</p>}
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-500 block mb-1">Notes (optional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Terms, conditions, remarks…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>

      {/* Items */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Items</p>
        </div>
        <div className="divide-y divide-gray-100">
          {items.map((it, i) => {
            const l = calcLine(it);
            return (
              <div key={i} className="px-4 py-3 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <ProductSearch value={it.productName} products={products} onSelect={p => selectProduct(i, p)} placeholder="Search product…" />
                    {it.productId && <p className="text-xs text-gray-400 mt-0.5 font-mono">{it.sku}</p>}
                  </div>
                  <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 mt-1.5 shrink-0">✕</button>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <div>
                    <label className="text-xs text-gray-400 block mb-0.5">Qty</label>
                    <input type="number" min="0" value={it.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-0.5">Rate ₹</label>
                    <input type="number" min="0" value={it.unitPrice} onChange={e => updateItem(i, 'unitPrice', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-0.5">Disc %</label>
                    <input type="number" min="0" max="100" value={it.discountPct} onChange={e => updateItem(i, 'discountPct', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-0.5">GST %</label>
                    <select value={it.gstRate} onChange={e => updateItem(i, 'gstRate', Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400">
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
        <button onClick={() => setItems(prev => [...prev, BLANK_ITEM()])}
          className="w-full py-2.5 border-t border-dashed border-gray-200 text-sm font-medium text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors">
          + Add Item
        </button>
      </div>

      {/* Totals */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-1.5 text-sm">
        <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(totals.subtotal + totals.discount)}</span></div>
        {totals.discount > 0 && <div className="flex justify-between text-red-600"><span>Discount</span><span>−{formatCurrency(totals.discount)}</span></div>}
        <div className="flex justify-between text-gray-600"><span>GST</span><span>{formatCurrency(totals.gst)}</span></div>
        <div className="flex justify-between font-bold text-indigo-800 text-base border-t border-indigo-200 pt-1.5">
          <span>Grand Total</span><span>{formatCurrency(totals.grand)}</span>
        </div>
      </div>

      <div className="flex justify-end gap-3 pb-10">
        <button onClick={() => navigate('/quotations')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {saving ? '⏳ Saving…' : isEdit ? '💾 Update' : '📋 Save Quotation'}
        </button>
      </div>
    </div>
  );
}
