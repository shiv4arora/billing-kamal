import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useInvoices } from '../../context/InvoiceContext';
import { useProducts } from '../../context/ProductContext';
import { useCustomers } from '../../context/CustomerContext';
import { useSettings } from '../../context/SettingsContext';
import { useLedger } from '../../context/LedgerContext';
import { Button, Input, Select, Textarea, Card } from '../../components/ui';
import { useGlobalToast } from '../../context/ToastContext';
import { buildInvoiceTotals, formatCurrency, getPrice, nextInvoiceNumber, today, formatCustomerDisplay } from '../../utils/helpers';
import { GST_RATES } from '../../constants';
import { useInvoiceLock } from '../../hooks/useInvoiceLock';
import { useUnsavedChanges, UnsavedChangesModal } from '../../hooks/useUnsavedChanges.jsx';

const BLANK_ITEM = { productId: '', productName: '', sku: '', hsnCode: '', unit: 'Pcs', quantity: 1, unitPrice: 0, discountPct: 0, gstRate: 0 };

export default function SaleInvoiceCreate() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const { addSaleInvoice, issueSaleInvoice, updateSaleInvoice, getSaleInvoice, addStockEntry } = useInvoices();
  const { active: products, updateStock } = useProducts();
  const { active: customers, updateBalance } = useCustomers();
  const { settings, bumpSaleNo } = useSettings();
  const { addSaleEntry, addPaymentIn } = useLedger();
  const isEdit = !!id;
  const lock = useInvoiceLock('sales', isEdit ? id : null);

  const [customerId, setCustomerId] = useState('');
  const [customerType, setCustomerType] = useState('shop');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState('');
  const [items, setItems] = useState([{ ...BLANK_ITEM }]);
  const [notes, setNotes] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [productSearch, setProductSearch] = useState({});
  const [showDropdown, setShowDropdown] = useState({});
  const [skuQuickAdd, setSkuQuickAdd] = useState('');
  const dropdownRefs = useRef({});

  useEffect(() => {
    if (isEdit) {
      const inv = getSaleInvoice(id);
      if (inv) {
        setCustomerId(inv.customerId || '');
        setCustomerType(inv.customerType || 'shop');
        const cust = customers.find(c => c.id === (inv.customerId || ''));
        if (cust) setCustomerSearch(formatCustomerDisplay(cust));
        setDate(inv.date);
        setDueDate(inv.dueDate || '');
        setItems(inv.items || [{ ...BLANK_ITEM }]);
        setNotes(inv.notes || '');
        setAmountPaid(inv.amountPaid || '');
        setPaymentMethod(inv.paymentMethod || 'cash');
      }
    }
  }, [id]);

  const customer = customers.find(c => c.id === customerId);

  const confirmLeave = useUnsavedChanges(isDirty);

  const handleCustomerChange = (cid) => {
    setIsDirty(true);
    setCustomerId(cid);
    const c = customers.find(x => x.id === cid);
    if (c) {
      setCustomerType(c.type);
      setItems(prev => prev.map(item => {
        if (!item.productId) return item;
        const prod = products.find(p => p.id === item.productId);
        return prod ? { ...item, unitPrice: getPrice(prod, c.type) } : item;
      }));
    }
  };

  const qtyRefs = useRef({});
  const skuInputRef = useRef(null);

  const handleProductSelect = (idx, prod) => {
    setIsDirty(true);
    const price = getPrice(prod, customerType);
    setItems(prev => {
      const updated = prev.map((item, i) => i === idx ? {
        ...item,
        productId: prod.id, productName: prod.name, sku: prod.sku || '',
        hsnCode: prod.hsnCode || '', unit: prod.unit, unitPrice: price, gstRate: prod.gstRate || 0,
      } : item);
      if (idx === prev.length - 1) return [...updated, { ...BLANK_ITEM }];
      return updated;
    });
    setProductSearch(p => ({ ...p, [idx]: prod.name }));
    setShowDropdown(p => ({ ...p, [idx]: false }));
    setTimeout(() => { qtyRefs.current[idx]?.focus(); qtyRefs.current[idx]?.select(); }, 50);
  };

  const updateItem = (idx, field, value) => {
    setIsDirty(true);
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const [pendingDelete, setPendingDelete] = useState(null);

  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setProductSearch(p => { const n = {}; Object.entries(p).forEach(([k, v]) => { const ki = +k; if (ki < idx) n[ki] = v; else if (ki > idx) n[ki - 1] = v; }); return n; });
    setPendingDelete(null);
  };
  const replaceItem = (idx) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...BLANK_ITEM } : item));
    setProductSearch(p => ({ ...p, [idx]: '' }));
    setShowDropdown(p => ({ ...p, [idx]: false }));
    setPendingDelete(null);
  };
  const addItem = () => setItems(prev => [...prev, { ...BLANK_ITEM }]);
  const insertAfter = (idx) => {
    setItems(prev => [...prev.slice(0, idx + 1), { ...BLANK_ITEM }, ...prev.slice(idx + 1)]);
    setPendingDelete(null);
  };

  const totals = buildInvoiceTotals(items.filter(i => i.productId && i.quantity > 0), settings.tax.intraState === false);

  const handleSave = async (status) => {
    if (!customerId) { toast.error('Please select a customer'); return; }
    if (totals.items.length === 0) { toast.error('Add at least one item'); return; }
    setSaving(true);

    try {
      const paid = +amountPaid || 0;
      const payStatus = paid >= totals.grandTotal ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
      const dueD = dueDate || (() => { const d = new Date(date); d.setDate(d.getDate() + (settings.invoice?.defaultDueDays || 14)); return d.toISOString().slice(0,10); })();

      const invData = { date, dueDate: dueD, customerId, customerName: customer?.name || '', customerPlace: customer?.place || '', customerType, customerAddress: customer?.address || '', customerGstin: customer?.gstin || '', items: totals.items, ...totals, amountPaid: paid, paymentMethod, paymentStatus: payStatus, paymentDate: paid > 0 ? today() : null, notes, status: 'draft' };

      setIsDirty(false);
      if (isEdit) {
        await updateSaleInvoice(id, { ...invData, status });
        toast.success('Invoice updated');
        navigate('/sales');
      } else {
        const saved = await addSaleInvoice(invData);
        if (status === 'issued') {
          const issued = await issueSaleInvoice(saved.id);
          toast.success(`Invoice ${issued.invoiceNumber} issued`);
          navigate(`/sales/${saved.id}`);
        } else {
          toast.success('Draft saved');
          navigate(`/sales/${saved.id}`);
        }
      }
    } catch (err) {
      toast.error(err.message || 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = (search) => products.filter(p => p.name?.toLowerCase().includes((search || '').toLowerCase()) || p.sku?.toLowerCase().includes((search || '').toLowerCase())).slice(0, 8);

  const addProductBySku = (code) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const prod = products.find(p => p.sku === trimmed || p.sku?.toLowerCase() === trimmed.toLowerCase());
    if (!prod) { toast.error(`No product with code "${trimmed}"`); setSkuQuickAdd(''); return; }
    const price = getPrice(prod, customerType);
    // Find if last item is blank — reuse it; otherwise append
    const lastIdx = items.length - 1;
    const lastIsBlank = !items[lastIdx]?.productId;
    const newIdx = lastIsBlank ? lastIdx : items.length;
    setItems(prev => {
      const newItem = { ...BLANK_ITEM, productId: prod.id, productName: prod.name, sku: prod.sku || '', hsnCode: prod.hsnCode || '', unit: prod.unit, unitPrice: price, gstRate: prod.gstRate || 0 };
      if (lastIsBlank) return prev.map((item, i) => i === lastIdx ? newItem : item);
      return [...prev, newItem];
    });
    setSkuQuickAdd('');
    setTimeout(() => { qtyRefs.current[newIdx]?.focus(); qtyRefs.current[newIdx]?.select(); }, 50);
  };

  // If locked by someone else, show read-only warning banner
  if (lock.blocked) {
    return (
      <div className="max-w-5xl">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate('/sales')} className="text-gray-400 hover:text-gray-600">←</button>
          <h1 className="text-2xl font-bold text-gray-900">Sale Invoice (View Only)</h1>
        </div>
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 flex items-start gap-4">
          <span className="text-3xl">🔒</span>
          <div>
            <p className="font-semibold text-amber-800 text-lg">Invoice is being edited by {lock.lockedBy}</p>
            <p className="text-amber-700 text-sm mt-1">This invoice is currently open for editing on another device. You can view it below but cannot make changes until they are done.</p>
            <button onClick={() => navigate(`/sales/${id}`)} className="mt-3 px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 font-medium">View Invoice →</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-5xl space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => { if (confirmLeave()) navigate('/sales'); }} className="text-gray-400 hover:text-gray-600">←</button>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Sale Invoice' : 'New Sale Invoice'}</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card>
            <h3 className="font-semibold text-gray-800 mb-4">Customer</h3>
            <div className="relative">
              <label className="text-sm font-medium text-gray-700 block mb-1">Select Customer *</label>
              <input
                value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDrop(true); }}
                onFocus={() => setShowCustomerDrop(true)}
                onBlur={() => setTimeout(() => setShowCustomerDrop(false), 150)}
                placeholder="Type to search customer…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {showCustomerDrop && (
                <div className="absolute z-30 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
                  {customers
                    .filter(c => !customerSearch || formatCustomerDisplay(c).toLowerCase().includes(customerSearch.toLowerCase()) || c.phone?.includes(customerSearch))
                    .map(c => (
                      <div
                        key={c.id}
                        className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer"
                        onMouseDown={() => { handleCustomerChange(c.id); setCustomerSearch(formatCustomerDisplay(c)); setShowCustomerDrop(false); }}
                      >
                        <p className="text-sm font-semibold text-gray-800">{formatCustomerDisplay(c)}</p>
                        {c.phone && <p className="text-xs text-gray-400">{c.phone}{c.place ? ` · ${c.place}` : ''}</p>}
                      </div>
                    ))
                  }
                  {customers.filter(c => !customerSearch || formatCustomerDisplay(c).toLowerCase().includes(customerSearch.toLowerCase()) || c.phone?.includes(customerSearch)).length === 0 && (
                    <p className="px-4 py-3 text-sm text-gray-400">No customers found</p>
                  )}
                </div>
              )}
            </div>
            {customer && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm">
                <p className="font-semibold text-blue-800">{formatCustomerDisplay(customer)}</p>
                <p className="text-blue-600 text-xs mt-0.5">{customer.phone}</p>
                {customer.gstin && <p className="text-blue-500 text-xs mt-0.5">GSTIN: {customer.gstin}</p>}
              </div>
            )}
          </Card>
          <Card>
            <h3 className="font-semibold text-gray-800 mb-4">Invoice Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Invoice Date" type="date" value={date} onChange={e => setDate(e.target.value)} />
              <Input label="Due Date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              <Select label="Payment Method" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank Transfer</option><option value="credit">Credit</option>
              </Select>
              <Input label="Amount Paid (₹)" type="number" min="0" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} placeholder="0" />
            </div>
          </Card>
        </div>

        {/* Line Items */}
        <Card padding={false}>
          <div className="p-4 border-b flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-semibold text-gray-800">Items</h3>
            {/* SKU Quick-Add */}
            <div className="flex items-center gap-2 flex-1 max-w-xs">
              <div className="relative flex-1">
                <input
                  ref={skuInputRef}
                  value={skuQuickAdd}
                  onChange={e => setSkuQuickAdd(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProductBySku(skuQuickAdd); } }}
                  placeholder="Scan / type SKU code + ↵"
                  className="w-full border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-blue-300"
                />
              </div>
              <button
                type="button"
                onClick={() => addProductBySku(skuQuickAdd)}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium"
              >
                Add
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <th className="px-3 py-2 text-center w-8">#</th>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-left w-20">SKU</th>
                <th className="px-3 py-2 text-right w-20">Qty</th>
                <th className="px-3 py-2 text-right w-28">Rate (₹) 🔒</th>
                <th className="px-3 py-2 text-right w-20">Disc%</th>
                <th className="px-3 py-2 text-right w-20">GST%</th>
                <th className="px-3 py-2 text-right w-28">Total</th>
                <th className="px-3 py-2 w-8"></th>
              </tr></thead>
              <tbody>
                {items.map((item, idx) => {
                  const gross = item.quantity * item.unitPrice;
                  const disc = (gross * (item.discountPct || 0)) / 100;
                  const taxable = gross - disc;
                  const gst = (taxable * (item.gstRate || 0)) / 100;
                  const lineTotal = taxable + gst;
                  const search = productSearch[idx] ?? item.productName ?? '';
                  return (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 text-center text-xs text-gray-400 font-medium">{idx + 1}</td>
                      <td className="px-3 py-2 relative">
                        <input value={search} onChange={e => { setProductSearch(p => ({ ...p, [idx]: e.target.value })); setShowDropdown(p => ({ ...p, [idx]: true })); }} onFocus={() => setShowDropdown(p => ({ ...p, [idx]: true }))}
                          placeholder="Search product…" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        {showDropdown[idx] && filteredProducts(search).length > 0 && (
                          <div ref={el => dropdownRefs.current[idx] = el} className="absolute z-30 top-full left-0 w-80 bg-white border border-gray-200 rounded-lg shadow-xl mt-1">
                            {filteredProducts(search).map(p => (
                              <div key={p.id} className="px-3 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0" onMouseDown={() => handleProductSelect(idx, p)}>
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-medium text-gray-800 text-sm truncate">{p.name}</p>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {p.supplier && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{p.supplier.code || p.supplier.name}</span>}
                                    {p.sku && <span className="text-xs font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded font-mono">#{p.sku}</span>}
                                  </div>
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">W:{formatCurrency(p.pricing?.wholesale||0)} · S:{formatCurrency(p.pricing?.shop||0)} · Stock:{p.currentStock||0}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {item.sku ? (
                          <span className="text-xs font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{item.sku}</span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2"><input ref={el => qtyRefs.current[idx] = el} type="number" min="0" value={item.quantity} onChange={e => updateItem(idx, 'quantity', +e.target.value)} onWheel={e => e.target.blur()} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); skuInputRef.current?.focus(); skuInputRef.current?.select(); } }} className="w-16 border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400" /></td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-sm font-medium text-gray-700 w-24 inline-block">{item.unitPrice ? formatCurrency(item.unitPrice) : '—'}</span>
                      </td>
                      <td className="px-3 py-2"><input type="number" min="0" max="100" value={item.discountPct} onChange={e => updateItem(idx, 'discountPct', +e.target.value)} onWheel={e => e.target.blur()} className="w-16 border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400" /></td>
                      <td className="px-3 py-2">
                        <select value={item.gstRate} onChange={e => updateItem(idx, 'gstRate', +e.target.value)} className="w-16 border border-gray-200 rounded px-1 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
                          {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{item.productId ? formatCurrency(lineTotal) : '-'}</td>
                      <td className="px-3 py-2">
                        {pendingDelete === idx ? (
                          <div className="flex items-center gap-1 whitespace-nowrap">
                            <button onClick={() => removeItem(idx)} className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium">Del</button>
                            <button onClick={() => replaceItem(idx)} className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200 font-medium">Replace</button>
                            <button onClick={() => setPendingDelete(null)} className="text-gray-300 hover:text-gray-500 text-xs">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => setPendingDelete(idx)} className="text-gray-300 hover:text-red-500">✕</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button
              onClick={addItem}
              className="w-full py-3 border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-400 hover:text-blue-500 text-sm font-medium transition-colors"
            >
              + Add Item
            </button>
          </div>
          {/* Totals */}
          <div className="flex justify-end p-5 border-t">
            <div className="w-72 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Total Items</span><span>{totals.items.length} items · {totals.items.reduce((s, i) => s + i.quantity, 0)} qty</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Discount</span><span className={totals.totalDiscount > 0 ? 'text-red-600' : 'text-gray-400'}>-{formatCurrency(totals.totalDiscount)}</span></div>
              {totals.totalCGST > 0 && <div className="flex justify-between"><span className="text-gray-500">CGST</span><span>{formatCurrency(totals.totalCGST)}</span></div>}
              {totals.totalSGST > 0 && <div className="flex justify-between"><span className="text-gray-500">SGST</span><span>{formatCurrency(totals.totalSGST)}</span></div>}
              {totals.totalIGST > 0 && <div className="flex justify-between"><span className="text-gray-500">IGST</span><span>{formatCurrency(totals.totalIGST)}</span></div>}
              {totals.roundOff !== 0 && <div className="flex justify-between"><span className="text-gray-500">Round Off</span><span>{formatCurrency(totals.roundOff)}</span></div>}
              <div className="flex justify-between font-bold text-base border-t pt-2"><span>Grand Total</span><span className="text-blue-700">{formatCurrency(totals.grandTotal)}</span></div>
              {+amountPaid > 0 && <div className="flex justify-between text-green-600"><span>Paid</span><span>{formatCurrency(+amountPaid)}</span></div>}
              {+amountPaid < totals.grandTotal && +amountPaid >= 0 && <div className="flex justify-between text-red-600 font-medium"><span>Balance</span><span>{formatCurrency(totals.grandTotal - (+amountPaid || 0))}</span></div>}
            </div>
          </div>
        </Card>

        <Card>
          <Textarea label="Notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any additional notes…" />
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => { if (confirmLeave()) navigate('/sales'); }}>Cancel</Button>
          <Button variant="outline" onClick={() => handleSave('draft')} disabled={saving}>Save as Draft</Button>
          <Button variant="success" onClick={() => handleSave('issued')} disabled={saving}>Issue Invoice</Button>
        </div>
      </div>
    </>
  );
}
