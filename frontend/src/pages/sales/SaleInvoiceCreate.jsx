import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useInvoices } from '../../context/InvoiceContext';
import { useProducts } from '../../context/ProductContext';
import { useCustomers } from '../../context/CustomerContext';
import { useSettings } from '../../context/SettingsContext';
import { useLedger } from '../../context/LedgerContext';
import { Button, Input, Select, Textarea, Card } from '../../components/ui';
import { useGlobalToast } from '../../context/ToastContext';
import { buildInvoiceTotals, formatCurrency, getPrice, nextInvoiceNumber, today, formatCustomerDisplay } from '../../utils/helpers';
import { api } from '../../hooks/useApi';
import { GST_RATES, UNITS } from '../../constants';
import { useInvoiceLock } from '../../hooks/useInvoiceLock';
import { useUnsavedChanges, UnsavedChangesModal } from '../../hooks/useUnsavedChanges.jsx';
import { useAutoSave, AutoSaveIndicator } from '../../hooks/useAutoSave';
import BarcodeScanner from '../../components/BarcodeScanner';

const BLANK_ITEM = { isFreeText: false, productId: '', productName: '', sku: '', hsnCode: '', unit: 'Pcs', quantity: 1, unitPrice: 0, discountPct: 0, gstRate: 0, vendorCode: '' };
const BLANK_CUSTOMER = { name: '', phone: '', place: '', type: 'wholesale', gstin: '' };

export default function SaleInvoiceCreate() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const { addSaleInvoice, issueSaleInvoice, updateSaleInvoice, getSaleInvoice, addStockEntry } = useInvoices();
  const { active: products, updateStock } = useProducts();
  const { active: customers, updateBalance, refreshOne: refreshCustomer, add: addCustomer } = useCustomers();
  const { settings, bumpSaleNo } = useSettings();
  const { addSaleEntry, addPaymentIn } = useLedger();
  const isEdit = !!id;
  const lock = useInvoiceLock('sales', isEdit ? id : null);

  const [customerId, setCustomerId] = useState('');
  const [customerType, setCustomerType] = useState('wholesale');
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
  const [dropdownPos, setDropdownPos] = useState({});
  const [skuQuickAdd, setSkuQuickAdd] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [bulkDiscount, setBulkDiscount] = useState('all');
  const [bulkGst, setBulkGst] = useState('');
  const [vendorDiscounts, setVendorDiscounts] = useState({});
  const [extraCharges, setExtraCharges] = useState({ charges: '' });
  const [autoSavedId, setAutoSavedId] = useState(null); // draft ID created by auto-save on new invoices
  const dropdownRefs = useRef({});
  const searchInputRefs = useRef({});

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
        setItems((inv.items || [{ ...BLANK_ITEM }]).map(i => ({ ...BLANK_ITEM, ...i, isFreeText: !i.productId && !!i.productName })));
        setNotes(inv.notes || '');
        setAmountPaid(inv.amountPaid || '');
        setPaymentMethod(inv.paymentMethod || 'cash');
        // Combine packing + shipping into a single field (old invoices may have both)
        const combined = (Number(inv.packingCharges) || 0) + (Number(inv.shippingCharges) || 0);
        setExtraCharges({ charges: combined > 0 ? String(combined) : '' });
        // Restore bulk GST from first item that has a rate set
        const firstGst = (inv.items || []).find(i => i.gstRate > 0)?.gstRate;
        if (firstGst != null) setBulkGst(String(firstGst));
      }
    }
  }, [id]);

  const customer = customers.find(c => c.id === customerId);

  const { confirmLeave, savePromptJsx } = useUnsavedChanges(isDirty);

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
        vendorCode: prod.supplier?.code || prod.supplier?.name || '',
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
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      if (field === '_bulk') return value; // full replace (used by free-text toggle)
      return { ...item, [field]: value };
    }));
  };

  const [pendingDelete, setPendingDelete] = useState(null);

  // ── New Customer inline modal ────────────────────────────────────────────────
  const [showNewCust, setShowNewCust] = useState(false);
  const [newCust, setNewCust] = useState(BLANK_CUSTOMER);
  const [newCustErrors, setNewCustErrors] = useState({});
  const [savingCust, setSavingCust] = useState(false);

  const handleNewCustSave = async () => {
    const errs = {};
    if (!newCust.name.trim())  errs.name  = 'Name is required';
    if (!newCust.phone.trim()) errs.phone = 'Phone is required';
    else if (!/^\d{10}$/.test(newCust.phone.trim())) errs.phone = '10-digit number required';
    if (!newCust.place.trim()) errs.place = 'Place is required';
    if (Object.keys(errs).length) { setNewCustErrors(errs); return; }
    setSavingCust(true);
    try {
      const created = await addCustomer({ ...newCust, isActive: true });
      handleCustomerChange(created.id);
      setCustomerSearch(formatCustomerDisplay(created));
      setShowNewCust(false);
      setNewCust(BLANK_CUSTOMER);
      setNewCustErrors({});
      toast.success(`Customer "${created.name}" added`);
    } catch (e) {
      toast.error(e.message || 'Failed to add customer');
    } finally {
      setSavingCust(false);
    }
  };

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
  const replaceWithFreeText = (idx) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...BLANK_ITEM, isFreeText: true } : item));
    setProductSearch(p => ({ ...p, [idx]: '' }));
    setShowDropdown(p => ({ ...p, [idx]: false }));
    setPendingDelete(null);
  };
  const applyBulkDiscount = () => {
    const pct = parseFloat(bulkDiscount);
    if (isNaN(pct) || pct < 0 || pct > 100) return;
    setItems(prev => prev.map(item => ({ ...item, discountPct: pct })));
    setIsDirty(true);
  };
  const applyBulkGst = (val) => {
    const rate = parseFloat(val ?? bulkGst);
    if (isNaN(rate)) return;
    setItems(prev => prev.map(item => ({ ...item, gstRate: rate })));
    setIsDirty(true);
  };

  const handleApplyDiscount = () => {
    const pct = parseFloat(vendorDiscounts['__input__']);
    if (isNaN(pct) || pct < 0 || pct > 100) return;
    if (bulkDiscount === 'all') {
      setItems(prev => prev.map(item => ({ ...item, discountPct: pct })));
    } else {
      setItems(prev => prev.map(item =>
        item.vendorCode === bulkDiscount ? { ...item, discountPct: pct } : item
      ));
    }
    setIsDirty(true);
  };

  const applyVendorDiscount = (vendorCode) => {
    const pct = parseFloat(vendorDiscounts[vendorCode]);
    if (isNaN(pct) || pct < 0 || pct > 100) return;
    setItems(prev => prev.map(item =>
      item.vendorCode === vendorCode ? { ...item, discountPct: pct } : item
    ));
    setIsDirty(true);
  };

  // Unique vendors present in current items (exclude free-text rows)
  const uniqueVendors = [...new Set(
    items.filter(i => i.productId && i.vendorCode).map(i => i.vendorCode)
  )];

  const addItem = () => setItems(prev => [...prev, { ...BLANK_ITEM }]);
  const insertAfter = (idx) => {
    setItems(prev => [...prev.slice(0, idx + 1), { ...BLANK_ITEM }, ...prev.slice(idx + 1)]);
    setPendingDelete(null);
  };

  const showDiscCol = items.some(i => (i.discountPct || 0) > 0);
  const validItems = items.filter(i => i.productId || (i.isFreeText && i.productName?.trim()));
  const totals = buildInvoiceTotals(validItems, settings.tax.intraState === false);
  const chargesAmt = parseFloat(extraCharges.charges) || 0;
  const finalTotal = totals.grandTotal + chargesAmt;

  // ── Auto-save ────────────────────────────────────────────────────────────
  const effectiveId = isEdit ? id : autoSavedId;

  const autoSaveData = useMemo(() => JSON.stringify({
    date, dueDate, customerId, customerType,
    items: items.map(i => ({ productId: i.productId, productName: i.productName, isFreeText: i.isFreeText, quantity: i.quantity, unitPrice: i.unitPrice, discountPct: i.discountPct, gstRate: i.gstRate })),
    amountPaid, paymentMethod, notes,
    charges: extraCharges.charges,
  }), [date, dueDate, customerId, customerType, items, amountPaid, paymentMethod, notes, extraCharges]);

  const performAutoSave = useCallback(async () => {
    if (saving) return;
    // Don't auto-save if the invoice has already been issued — sending status:'draft'
    // would downgrade it. The backend also guards against this, but prevent the call entirely.
    if (effectiveId) {
      const existing = getSaleInvoice(effectiveId);
      if (existing && existing.status !== 'draft') return;
    }
    const paid = +amountPaid || 0;
    const payStatus = paid >= finalTotal ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    const invData = {
      date, dueDate: dueDate || date,
      customerId, customerName: customer?.name || '',
      customerPlace: customer?.place || '', customerType,
      customerAddress: customer?.address || '', customerGstin: customer?.gstin || '',
      items: totals.items, ...totals,
      grandTotal: finalTotal, packingCharges: chargesAmt, shippingCharges: 0,
      amountPaid: paid, paymentMethod, paymentStatus: payStatus,
      paymentDate: paid > 0 ? today() : null, notes, status: 'draft',
    };
    if (effectiveId) {
      await api(`/sales/${effectiveId}`, { method: 'PUT', body: invData });
    } else {
      const saved = await api('/sales', { method: 'POST', body: invData });
      setAutoSavedId(saved.id);
    }
  }, [saving, amountPaid, finalTotal, date, dueDate, customerId, customer, customerType, totals, chargesAmt, paymentMethod, notes, effectiveId]);

  const autoSaveStatus = useAutoSave(autoSaveData, performAutoSave, { delay: 60000 });
  // ─────────────────────────────────────────────────────────────────────────

  const handleSave = async (status) => {
    if (!customerId) { toast.error('Please select a customer'); return; }
    for (const item of items) {
      if (item.isFreeText && !item.productName?.trim()) { toast.error('Enter a name for the free-text item'); return; }
    }
    if (totals.items.length === 0) { toast.error('Add at least one item'); return; }
    setSaving(true);

    try {
      const paid = +amountPaid || 0;
      const payStatus = paid >= finalTotal ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
      const dueD = dueDate || (() => { const d = new Date(date); d.setDate(d.getDate() + (settings.invoice?.defaultDueDays || 14)); return d.toISOString().slice(0,10); })();

      const invData = { date, dueDate: dueD, customerId, customerName: customer?.name || '', customerPlace: customer?.place || '', customerType, customerAddress: customer?.address || '', customerGstin: customer?.gstin || '', items: totals.items, ...totals, grandTotal: finalTotal, packingCharges: chargesAmt, shippingCharges: 0, amountPaid: paid, paymentMethod, paymentStatus: payStatus, paymentDate: paid > 0 ? today() : null, notes, status: 'draft' };

      setIsDirty(false);
      if (isEdit) {
        // Editing an existing invoice — update data + status, no re-issue
        const updated = await updateSaleInvoice(effectiveId, { ...invData, status });
        if (updated?.customerId) refreshCustomer(updated.customerId);
        toast.success('Invoice updated');
        navigate(`/sales/${effectiveId}`);
      } else if (effectiveId) {
        // New invoice that was auto-saved as a draft — update data, then issue
        await updateSaleInvoice(effectiveId, invData);
        const issued = await issueSaleInvoice(effectiveId);
        if (issued.customerId) refreshCustomer(issued.customerId);
        toast.success(`Invoice ${issued.invoiceNumber} issued`);
        navigate(`/sales/${effectiveId}`);
      } else {
        // Brand-new invoice, never auto-saved
        const saved = await addSaleInvoice(invData);
        const issued = await issueSaleInvoice(saved.id);
        if (issued.customerId) refreshCustomer(issued.customerId);
        toast.success(`Invoice ${issued.invoiceNumber} issued`);
        navigate(`/sales/${saved.id}`);
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
    if (!prod) { toast.error(`No product with code "${trimmed}"`); return; }  // keep text in field
    const price = getPrice(prod, customerType);
    // Find if last item is blank (not a free-text row) — reuse it; otherwise append
    const lastIdx = items.length - 1;
    const lastIsBlank = !items[lastIdx]?.productId && !items[lastIdx]?.isFreeText;
    const newIdx = lastIsBlank ? lastIdx : items.length;
    setItems(prev => {
      const newItem = { ...BLANK_ITEM, productId: prod.id, productName: prod.name, sku: prod.sku || '', hsnCode: prod.hsnCode || '', unit: prod.unit, unitPrice: price, gstRate: prod.gstRate || 0, vendorCode: prod.supplier?.code || prod.supplier?.name || '' };
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
          <button onClick={() => navigate('/sales')} className="text-gray-400 hover:text-gray-600 p-1 -ml-1 text-lg">←</button>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Sale Invoice (View Only)</h1>
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
      {savePromptJsx}
      {showScanner && (
        <BarcodeScanner
          onScan={code => {
            setShowScanner(false);
            setSkuQuickAdd(code);
            // setTimeout breaks React 18 batching — field renders the scanned text
            // before addProductBySku potentially clears it
            setTimeout(() => addProductBySku(code), 0);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
      <div className="max-w-5xl space-y-5 pb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { if (confirmLeave()) navigate('/sales'); }} className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1 -ml-1">←</button>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{isEdit ? 'Edit Sale Invoice' : 'New Sale Invoice'}</h1>
          <AutoSaveIndicator status={autoSaveStatus} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Customer</h3>
              <button
                type="button"
                onClick={() => { setShowNewCust(v => !v); setNewCust(BLANK_CUSTOMER); setNewCustErrors({}); }}
                className="text-xs px-2.5 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 font-medium transition-colors"
              >
                {showNewCust ? '✕ Cancel' : '+ New Customer'}
              </button>
            </div>

            {/* ── Inline new-customer form ── */}
            {showNewCust && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl space-y-2">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Quick Add Customer</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <input
                      value={newCust.name}
                      onChange={e => setNewCust(p => ({ ...p, name: e.target.value }))}
                      placeholder="Customer name *"
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 ${newCustErrors.name ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'}`}
                    />
                    {newCustErrors.name && <p className="text-xs text-red-500 mt-0.5">{newCustErrors.name}</p>}
                  </div>
                  <div>
                    <input
                      value={newCust.phone}
                      onChange={e => setNewCust(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                      placeholder="Phone (10 digits) *"
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 ${newCustErrors.phone ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'}`}
                    />
                    {newCustErrors.phone && <p className="text-xs text-red-500 mt-0.5">{newCustErrors.phone}</p>}
                  </div>
                  <div>
                    <input
                      value={newCust.place}
                      onChange={e => setNewCust(p => ({ ...p, place: e.target.value }))}
                      placeholder="Place / city *"
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 ${newCustErrors.place ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'}`}
                    />
                    {newCustErrors.place && <p className="text-xs text-red-500 mt-0.5">{newCustErrors.place}</p>}
                  </div>
                  <div>
                    <select
                      value={newCust.type}
                      onChange={e => setNewCust(p => ({ ...p, type: e.target.value }))}
                      className="w-full border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    >
                      <option value="shop">Shop</option>
                      <option value="wholesale">Wholesale</option>
                    </select>
                  </div>
                  <div>
                    <input
                      value={newCust.gstin}
                      onChange={e => setNewCust(p => ({ ...p, gstin: e.target.value }))}
                      placeholder="GSTIN (optional)"
                      className="w-full border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleNewCustSave}
                  disabled={savingCust}
                  className="w-full py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors mt-1"
                >
                  {savingCust ? 'Saving…' : 'Save & Select Customer'}
                </button>
              </div>
            )}

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
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">

              {/* Row 1: dates */}
              <Input label="Invoice Date" type="date" value={date} onChange={e => setDate(e.target.value)} />
              <Input label="Due Date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />

              {/* Row 2: payment */}
              <Select label="Payment" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank Transfer</option><option value="credit">Credit</option>
              </Select>
              <Input label="Amt Paid (₹)" type="number" min="0" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} placeholder="0" />

              {/* Discount — unified dropdown */}
              <div className="sm:col-span-2">
                <p className="text-xs font-medium text-gray-500 mb-1">Discount %</p>
                <div className="flex gap-1.5">
                  <select value={bulkDiscount} onChange={e => setBulkDiscount(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="all">All Items</option>
                    {uniqueVendors.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <input type="number" min="0" max="100" value={vendorDiscounts['__input__'] ?? ''}
                    onChange={e => setVendorDiscounts(p => ({ ...p, '__input__': e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleApplyDiscount(); e.target.blur(); } }}
                    placeholder="0%" className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={handleApplyDiscount}
                    className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 font-medium">Apply</button>
                </div>
              </div>

              {/* GST + extra charges */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">GST % · All Items</p>
                <select value={bulkGst} onChange={e => { setBulkGst(e.target.value); applyBulkGst(e.target.value); }}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">— select —</option>
                  {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Packing / Shipping (₹)</p>
                <input type="number" min="0" value={extraCharges.charges}
                  onChange={e => { setExtraCharges({ charges: e.target.value }); setIsDirty(true); }}
                  placeholder="0" onWheel={e => e.target.blur()}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

            </div>
          </Card>
        </div>

        {/* Line Items */}
        <Card padding={false}>
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Items</h3>
            {validItems.length > 0 && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{validItems.length} item{validItems.length !== 1 ? 's' : ''}</span>}
          </div>

          {/* ── MOBILE ITEMS (card-based, no horizontal scroll) ────── */}
          <div className="lg:hidden">
            {/* Item cards */}
            <div className="divide-y divide-gray-100">
              {items.map((item, idx) => {
                const gross = item.quantity * item.unitPrice;
                const disc = (gross * (item.discountPct || 0)) / 100;
                const taxable = gross - disc;
                const search = productSearch[idx] ?? item.productName ?? '';
                return (
                  <div key={idx} className="p-3 space-y-2">
                    {/* Product name row */}
                    <div className="flex gap-2 items-start">
                      <span className="text-xs text-gray-400 pt-2.5 w-5 shrink-0 text-center">{idx + 1}</span>
                      {item.isFreeText ? (
                        <input
                          value={item.productName}
                          onChange={e => updateItem(idx, 'productName', e.target.value)}
                          placeholder="Item name"
                          className="flex-1 border border-orange-300 bg-orange-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                        />
                      ) : (
                        <div className="relative flex-1">
                          <input
                            value={search}
                            onChange={e => { setProductSearch(p => ({ ...p, [idx]: e.target.value })); setShowDropdown(p => ({ ...p, [idx]: true })); }}
                            onFocus={() => setShowDropdown(p => ({ ...p, [idx]: true }))}
                            onBlur={() => setTimeout(() => setShowDropdown(p => ({ ...p, [idx]: false })), 200)}
                            placeholder="Search product…"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                          {item.productId && !showDropdown[idx] && (
                            <div className="mt-1 flex gap-1 flex-wrap">
                              {item.sku && <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">#{item.sku}</span>}
                              {item.vendorCode && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{item.vendorCode}</span>}
                            </div>
                          )}
                          {showDropdown[idx] && filteredProducts(search).length > 0 && (
                            <div className="absolute z-30 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
                              {filteredProducts(search).map(p => (
                                <div key={p.id}
                                  className="px-3 py-2.5 active:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0"
                                  onMouseDown={e => { e.preventDefault(); handleProductSelect(idx, p); }}>
                                  <p className="font-medium text-gray-800 text-sm">{p.name}</p>
                                  <p className="text-xs text-gray-400">{p.sku ? `#${p.sku} · ` : ''}W:{formatCurrency(p.pricing?.wholesale || 0)} · S:{formatCurrency(p.pricing?.shop || 0)} · Stock:{p.currentStock || 0}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <button onClick={() => setPendingDelete(idx)} className="text-gray-300 active:text-red-500 p-1.5 mt-0.5 shrink-0">✕</button>
                    </div>

                    {/* Qty stepper × Rate = Total */}
                    <div className="flex items-center gap-2 pl-5">
                      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white text-sm">
                        <button type="button" onClick={() => updateItem(idx, 'quantity', Math.max(0, item.quantity - 1))}
                          className="px-2.5 py-2 text-gray-600 active:bg-gray-100 font-bold leading-none">−</button>
                        <input ref={el => qtyRefs.current[idx] = el} type="number" value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', +e.target.value)} min="0"
                          onWheel={e => e.target.blur()}
                          className="w-12 text-center py-2 text-sm focus:outline-none border-x border-gray-200" />
                        <button type="button" onClick={() => updateItem(idx, 'quantity', item.quantity + 1)}
                          className="px-2.5 py-2 text-gray-600 active:bg-gray-100 font-bold leading-none">+</button>
                      </div>
                      {item.isFreeText ? (
                        <select value={item.unit || 'Pcs'} onChange={e => updateItem(idx, 'unit', e.target.value)}
                          className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-1.5 py-2 focus:outline-none cursor-pointer">
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-400 shrink-0">{item.unit || 'Pcs'}</span>
                      )}
                      <span className="text-gray-300 text-sm">×</span>
                      {item.isFreeText ? (
                        <input type="number" value={item.unitPrice}
                          onChange={e => updateItem(idx, 'unitPrice', +e.target.value)}
                          onWheel={e => e.target.blur()}
                          placeholder="Rate"
                          className="flex-1 border border-orange-200 bg-orange-50 rounded-lg px-2 py-2 text-sm text-right focus:outline-none focus:ring-1 focus:ring-orange-400 min-w-0"
                        />
                      ) : (
                        <span className="flex-1 text-right text-sm font-medium text-gray-700">
                          {item.unitPrice ? formatCurrency(item.unitPrice) : '—'}
                        </span>
                      )}
                      <span className="text-gray-300 text-sm">=</span>
                      <span className="font-bold text-gray-900 text-sm w-20 text-right shrink-0">
                        {(item.productId || item.isFreeText) ? formatCurrency(taxable) : '—'}
                      </span>
                    </div>

                    {/* Delete confirmation */}
                    {pendingDelete === idx && (
                      <div className="pl-5 flex gap-1.5 flex-wrap">
                        <button onClick={() => removeItem(idx)} className="flex-1 px-3 py-2 text-xs bg-red-500 text-white rounded-lg font-medium">Delete</button>
                        <button onClick={() => replaceItem(idx)} className="flex-1 px-3 py-2 text-xs bg-amber-500 text-white rounded-lg font-medium">Replace</button>
                        <button onClick={() => replaceWithFreeText(idx)} className="flex-1 px-3 py-2 text-xs bg-orange-500 text-white rounded-lg font-medium">Free Text</button>
                        <button onClick={() => setPendingDelete(null)} className="px-3 py-2 text-xs bg-gray-100 text-gray-600 rounded-lg font-medium">Cancel</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* SKU Scanner */}
            <div className="p-3 bg-blue-50 border-t border-blue-100">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="shrink-0 px-3 py-3 bg-white border border-blue-200 rounded-xl text-lg active:bg-blue-50"
                  title="Scan QR / Barcode"
                >📷</button>
                <input
                  value={skuQuickAdd}
                  onChange={e => setSkuQuickAdd(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProductBySku(skuQuickAdd); } }}
                  placeholder="Scan or type SKU + ↵"
                  enterKeyHint="go"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                  className="flex-1 border border-blue-200 bg-white rounded-xl px-3 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-blue-300"
                />
                <button type="button" onClick={() => addProductBySku(skuQuickAdd)}
                  className="px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm active:bg-blue-700">Add</button>
              </div>
            </div>

            {/* Add item buttons */}
            <div className="grid grid-cols-2 gap-2 p-3 border-t border-gray-100">
              <button onClick={addItem}
                className="py-3 bg-white border border-dashed border-gray-300 text-gray-500 text-sm rounded-xl active:bg-gray-50 font-medium">
                + Add Product
              </button>
              <button onClick={() => { setItems(prev => [...prev, { ...BLANK_ITEM, isFreeText: true }]); setIsDirty(true); }}
                className="py-3 bg-orange-50 border border-dashed border-orange-200 text-orange-600 text-sm rounded-xl active:bg-orange-100 font-medium">
                + Free Text
              </button>
            </div>
          </div>

          {/* ── DESKTOP ITEMS (wide table, unchanged) ───────────────── */}
          <div className="hidden lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm table-fixed">
                <thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                  <th className="px-3 py-3 text-center w-7">#</th>
                  <th className="px-3 py-3 text-left w-72">Product</th>
                  <th className="px-3 py-3 text-left w-12">SKU</th>
                  <th className="px-3 py-3 text-right w-20">Qty</th>
                  <th className="px-3 py-3 text-right w-24">Rate (₹)</th>
                  <th className="px-3 py-3 text-right w-24">Total</th>
                  {showDiscCol && <th className="px-3 py-3 text-right w-16">Disc%</th>}
                  {showDiscCol && <th className="px-3 py-3 text-right w-24">Amount</th>}
                  <th className="px-2 py-3 w-7"></th>
                </tr></thead>
                <tbody>
                  {items.map((item, idx) => {
                    const gross = item.quantity * item.unitPrice;
                    const disc = (gross * (item.discountPct || 0)) / 100;
                    const taxable = gross - disc;
                    const lineTotal = taxable; // GST shown only in totals, not per item
                    const search = productSearch[idx] ?? item.productName ?? '';
                    return (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-3 text-center text-xs text-gray-400 font-medium">{idx + 1}</td>
                        <td className="px-3 py-3">
                          {item.isFreeText ? (
                            <input
                              value={item.productName}
                              onChange={e => updateItem(idx, 'productName', e.target.value)}
                              placeholder="e.g. Rakhi SP-11"
                              className="w-full border border-orange-300 bg-orange-50 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400 dark:bg-[rgba(255,159,10,0.1)] dark:border-[rgba(255,159,10,0.4)] dark:text-white"
                            />
                          ) : (
                            <>
                              <input
                                ref={el => searchInputRefs.current[idx] = el}
                                value={search}
                                onChange={e => {
                                  setProductSearch(p => ({ ...p, [idx]: e.target.value }));
                                  setShowDropdown(p => ({ ...p, [idx]: true }));
                                }}
                                onFocus={e => {
                                  const rect = e.target.getBoundingClientRect();
                                  setDropdownPos(p => ({ ...p, [idx]: { top: rect.bottom + window.scrollY, left: rect.left + window.scrollX, width: Math.max(rect.width, 320) } }));
                                  setShowDropdown(p => ({ ...p, [idx]: true }));
                                }}
                                onBlur={() => setTimeout(() => setShowDropdown(p => ({ ...p, [idx]: false })), 200)}
                                placeholder="Search product…" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                              {showDropdown[idx] && filteredProducts(search).length > 0 && dropdownPos[idx] && (
                                <div ref={el => dropdownRefs.current[idx] = el} style={{ position: 'fixed', top: dropdownPos[idx].top + 4, left: dropdownPos[idx].left, width: dropdownPos[idx].width, zIndex: 9999 }} className="bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                                  {filteredProducts(search).map(p => (
                                    <div key={p.id} className="px-3 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0" onMouseDown={e => { e.preventDefault(); handleProductSelect(idx, p); }}>
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
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {item.sku ? (
                            <div className="space-y-0.5">
                              <span className="text-xs font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded block w-fit">{item.sku}</span>
                              {item.vendorCode && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded block w-fit">{item.vendorCode}</span>}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-center gap-1">
                            <input ref={el => qtyRefs.current[idx] = el} type="number" min="0" value={item.quantity} onChange={e => updateItem(idx, 'quantity', +e.target.value)} onWheel={e => e.target.blur()} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); skuInputRef.current?.focus(); skuInputRef.current?.select(); } }} className="w-16 border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400" />
                            {item.isFreeText ? (
                              <select value={item.unit || 'Pcs'} onChange={e => updateItem(idx, 'unit', e.target.value)} className="w-16 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-1 py-0.5 focus:outline-none cursor-pointer text-center">
                                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            ) : (
                              <span className="text-xs text-gray-400">{item.unit}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item.isFreeText ? (
                            <input
                              type="number" min="0" value={item.unitPrice}
                              onChange={e => updateItem(idx, 'unitPrice', +e.target.value)}
                              onWheel={e => e.target.blur()}
                              className="w-full border border-orange-200 bg-orange-50 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-orange-400"
                            />
                          ) : (
                            <span className="text-sm font-medium text-gray-700">{item.unitPrice ? formatCurrency(item.unitPrice) : '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{(item.productId || item.isFreeText) ? formatCurrency(gross) : '-'}</td>
                        {showDiscCol && <td className="px-3 py-3"><input type="number" min="0" max="100" value={item.discountPct} onChange={e => updateItem(idx, 'discountPct', +e.target.value)} onWheel={e => e.target.blur()} className="w-16 border border-gray-200 rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-400" /></td>}
                        {showDiscCol && <td className="px-3 py-3 text-right font-medium text-green-700">{(item.productId || item.isFreeText) ? formatCurrency(taxable) : '-'}</td>}
                        <td className="px-2 py-3 relative">
                          <button onClick={() => setPendingDelete(idx)} className="text-gray-300 hover:text-red-500">✕</button>
                          {pendingDelete === idx && (
                            <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg shadow-lg px-2 py-1.5 z-20 whitespace-nowrap">
                              <button onClick={() => removeItem(idx)} className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 font-medium">Delete</button>
                              <button onClick={() => replaceItem(idx)} className="px-2 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 font-medium">Replace</button>
                              <button onClick={() => replaceWithFreeText(idx)} className="px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 font-medium">Free Text</button>
                              <button onClick={() => setPendingDelete(null)} className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 font-medium">Cancel</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="border-t border-gray-200">
                <div className="flex min-h-[52px]">
                  <button onClick={addItem}
                    className="py-3 text-gray-400 hover:text-blue-500 hover:bg-blue-50 text-sm font-medium transition-colors border-r border-dashed border-gray-200 flex-[3]">
                    + Add Item
                  </button>
                  <button onClick={() => setItems(prev => [...prev, { ...BLANK_ITEM, isFreeText: true, productName: 'Rakhi SP-11' }])}
                    className="py-3 text-gray-400 hover:text-orange-500 hover:bg-orange-50 text-sm font-medium transition-colors border-r border-dashed border-gray-200 flex-[3]">
                    + Free Text
                  </button>
                  <div className="flex items-center gap-1 px-2 py-1.5 flex-[4]">
                    <button
                      type="button"
                      onClick={() => setShowScanner(true)}
                      className="flex-shrink-0 px-2 py-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded text-base"
                      title="Scan QR / Barcode"
                    >📷</button>
                    <input
                      ref={skuInputRef}
                      value={skuQuickAdd}
                      onChange={e => setSkuQuickAdd(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProductBySku(skuQuickAdd); } }}
                      placeholder="Scan or type SKU + ↵"
                      enterKeyHint="go"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck="false"
                      className="flex-1 border border-blue-200 bg-blue-50 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-blue-300 min-w-0"
                    />
                    <button type="button" onClick={() => addProductBySku(skuQuickAdd)}
                      className="flex-shrink-0 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 font-medium">Add</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Totals – shared */}
          <div className="flex justify-end p-4 sm:p-5 border-t">
            <div className="w-full sm:w-72 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Total Items</span><span>{totals.items.length} items · {totals.items.reduce((s, i) => s + i.quantity, 0)} qty</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Discount</span><span className={totals.totalDiscount > 0 ? 'text-red-600' : 'text-gray-400'}>-{formatCurrency(totals.totalDiscount)}</span></div>
              {totals.totalCGST > 0 && <div className="flex justify-between"><span className="text-gray-500">CGST</span><span>{formatCurrency(totals.totalCGST)}</span></div>}
              {totals.totalSGST > 0 && <div className="flex justify-between"><span className="text-gray-500">SGST</span><span>{formatCurrency(totals.totalSGST)}</span></div>}
              {totals.totalIGST > 0 && <div className="flex justify-between"><span className="text-gray-500">IGST</span><span>{formatCurrency(totals.totalIGST)}</span></div>}
              {totals.roundOff !== 0 && <div className="flex justify-between"><span className="text-gray-500">Round Off</span><span>{formatCurrency(totals.roundOff)}</span></div>}
              {chargesAmt > 0 && <div className="flex justify-between"><span className="text-gray-500">Packing / Shipping</span><span>{formatCurrency(chargesAmt)}</span></div>}
              <div className="flex justify-between font-bold text-base border-t pt-2"><span>Grand Total</span><span className="text-blue-700">{formatCurrency(finalTotal)}</span></div>
              {+amountPaid > 0 && <div className="flex justify-between text-green-600"><span>Paid</span><span>{formatCurrency(+amountPaid)}</span></div>}
              {+amountPaid < finalTotal && +amountPaid >= 0 && <div className="flex justify-between text-red-600 font-medium"><span>Balance</span><span>{formatCurrency(finalTotal - (+amountPaid || 0))}</span></div>}
            </div>
          </div>
        </Card>

        <Card>
          <Textarea label="Notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any additional notes…" />
        </Card>

        <div className="sticky bottom-0 bg-gray-50 dark:bg-black border-t border-gray-200 dark:border-gray-700 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 sm:py-0 sm:static sm:bg-transparent sm:border-0 z-10">
          {/* Mobile: total + buttons */}
          {finalTotal > 0 && (
            <div className="sm:hidden flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500">Grand Total</span>
              <span className="text-lg font-bold text-blue-700">{formatCurrency(finalTotal)}</span>
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
            <Button variant="secondary" type="button" onClick={() => { if (confirmLeave()) navigate('/sales'); }} className="justify-center">Cancel</Button>
            <Button variant="success" onClick={() => handleSave('issued')} disabled={saving} className="justify-center">
              {saving ? 'Saving…' : 'Issue Invoice'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
