import { useState, useEffect, useRef } from 'react';
import { api } from '../../hooks/useApi';
import { useInvoiceLock } from '../../hooks/useInvoiceLock';
import { useNavigate, useParams } from 'react-router-dom';
import { useInvoices } from '../../context/InvoiceContext';
import { useProducts } from '../../context/ProductContext';
import { useSuppliers } from '../../context/SupplierContext';
import { useSettings } from '../../context/SettingsContext';
import { Button, Input, Select, Textarea, Card, useToast, Toast } from '../../components/ui';
import { buildInvoiceTotals, formatCurrency, today } from '../../utils/helpers';
import { GST_RATES, UNITS } from '../../constants';
import * as XLSX from 'xlsx';

/* ─── helpers ────────────────────────────────────────────────────────── */
function calcSellingPrices(cost, supplierMargin = {}, supplierDiscount = 0) {
  const netCost = cost * (1 - supplierDiscount / 100);
  return {
    wholesale: +(netCost * (1 + (supplierMargin.wholesale || 0) / 100)).toFixed(2),
    shop:      +(netCost * (1 + (supplierMargin.shop      || 0) / 100)).toFixed(2),
  };
}


const BLANK_ITEM = {
  isNew: false,         // true → create new product on issue
  productId: '',
  productName: '',
  sku: '',
  category: '',
  unit: 'Pcs',
  hsnCode: '',
  gstRate: 0,
  quantity: 1,
  unitPrice: 0,         // purchase cost
  pricing: { wholesale: '', shop: '' },
};

/* ─── Inline item card ───────────────────────────────────────────────── */
function ItemCard({ item, idx, supplier, products, onUpdate, onRemove, nextSku }) {
  const [search, setSearch] = useState(item.productName || '');
  const [showDrop, setShowDrop] = useState(false);
  const dropRef = useRef(null);

  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8);

  // Recalculate selling prices when cost or supplier margin changes
  const reCalc = (cost) => {
    const pricing = calcSellingPrices(+cost, supplier?.margin, supplier?.discount);
    onUpdate('pricing', pricing);
  };

  const selectExisting = (prod) => {
    setSearch(prod.name);
    setShowDrop(false);
    const pricing = calcSellingPrices(prod.costPrice || 0, supplier?.margin, supplier?.discount);
    onUpdate('_bulk', {
      isNew: false, productId: prod.id, productName: prod.name,
      sku: prod.sku || '', category: prod.category || '',
      unit: prod.unit || 'Pcs', hsnCode: prod.hsnCode || '',
      gstRate: prod.gstRate ?? 0, unitPrice: prod.costPrice || 0,
      pricing,
    });
  };

  const toggleNew = () => {
    const next = !item.isNew;
    const pricing = calcSellingPrices(item.unitPrice, supplier?.margin, supplier?.discount);
    // SKU is always auto-assigned by backend — clear it when toggling
    onUpdate('_bulk', { ...item, isNew: next, productId: next ? '' : item.productId, pricing, sku: '' });
    if (next) { setSearch(''); }
  };

  const taxable = item.quantity * item.unitPrice;
  const gstAmt  = (taxable * (item.gstRate || 0)) / 100;
  const lineTotal = taxable + gstAmt;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* ── row header ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Item {idx + 1}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleNew}
            className={`text-xs px-2 py-1 rounded-full font-medium border transition-colors ${item.isNew ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-500 border-gray-300 hover:border-blue-400 hover:text-blue-600'}`}
          >
            {item.isNew ? '✦ New Product' : '+ New Product'}
          </button>
          <button type="button" onClick={onRemove} className="text-gray-300 hover:text-red-500 text-lg leading-none">✕</button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* ── Product search / name ── */}
        {item.isNew ? (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Product Name *"
              value={item.productName}
              onChange={e => onUpdate('productName', e.target.value)}
              placeholder="e.g. Basmati Rice 5kg"
              className="col-span-2"
            />
            {/* SKU ID — read-only preview of what will be assigned on save */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">SKU ID</label>
              <div className="flex items-center gap-2 w-full border border-blue-200 bg-blue-50 rounded-lg px-3 py-2">
                <span className="text-xs bg-blue-600 text-white font-semibold px-2 py-0.5 rounded-full">AUTO</span>
                <span className="text-base font-mono font-bold text-blue-800 tracking-widest">
                  {nextSku !== null ? String(nextSku) : '…'}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">This SKU ID will be permanently assigned when you save.</p>
            </div>
            <Input label="Category" value={item.category} onChange={e => onUpdate('category', e.target.value)} placeholder="e.g. Grains" />
            <Select label="Unit" value={item.unit} onChange={e => onUpdate('unit', e.target.value)}>
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </Select>
            <Input label="HSN Code" value={item.hsnCode} onChange={e => onUpdate('hsnCode', e.target.value)} placeholder="e.g. 1006" />
          </div>
        ) : (
          <div className="relative">
            <label className="text-sm font-medium text-gray-700 block mb-1">Select Product *</label>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDrop(true); }}
              onFocus={() => setShowDrop(true)}
              placeholder="Search by name or SKU ID…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {item.productId && (
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {item.sku && (
                  <span className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-md px-2 py-0.5 text-xs font-mono font-bold text-blue-700">
                    SKU: {item.sku}
                  </span>
                )}
                {item.category && <span className="text-xs text-gray-400">{item.category}</span>}
                {item.unit && <span className="text-xs text-gray-400">· {item.unit}</span>}
              </div>
            )}
            {showDrop && filtered.length > 0 && (
              <div ref={dropRef} className="absolute z-30 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
                {filtered.map(p => (
                  <div key={p.id} className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer" onMouseDown={() => selectExisting(p)}>
                    <p className="text-sm font-semibold text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{p.sku} · Cost: {formatCurrency(p.costPrice || 0)} · Stock: {p.currentStock || 0} {p.unit}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Quantity + Cost + GST ── */}
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Quantity"
            type="number" min="0"
            value={item.quantity}
            onChange={e => onUpdate('quantity', +e.target.value)}
          />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Purchase Cost (₹)</label>
            <input
              type="number" min="0" step="0.01"
              value={item.unitPrice}
              onChange={e => { onUpdate('unitPrice', +e.target.value); reCalc(e.target.value); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Select label="GST %" value={item.gstRate} onChange={e => onUpdate('gstRate', +e.target.value)}>
            {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
          </Select>
        </div>

        {/* ── Selling Prices (auto-calculated from supplier margins) ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Selling Prices</p>
            {supplier?.margin && (
              <p className="text-xs text-gray-400">
                Auto from supplier margins
                {supplier.discount > 0 && ` · ${supplier.discount}% discount applied`}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { tier: 'wholesale', label: 'Wholesale', color: 'blue',   margin: supplier?.margin?.wholesale },
              { tier: 'shop',      label: 'Shop',      color: 'purple', margin: supplier?.margin?.shop },
            ].map(({ tier, label, color, margin }) => (
              <div key={tier} className={`bg-${color}-50 border border-${color}-100 rounded-xl p-2.5`}>
                <div className="flex items-center justify-between mb-1">
                  <p className={`text-[10px] font-bold text-${color}-600 uppercase tracking-wide`}>{label}</p>
                  {margin != null && <p className="text-[9px] text-gray-400">{margin}% margin</p>}
                </div>
                <div className="flex items-center gap-1">
                  <span className={`text-xs text-${color}-500`}>₹</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={item.pricing[tier]}
                    onChange={e => onUpdate('pricing', { ...item.pricing, [tier]: e.target.value === '' ? '' : +e.target.value })}
                    className={`w-full bg-white border border-${color}-200 rounded-lg px-2 py-1 text-sm text-right font-bold text-${color}-800 focus:outline-none focus:ring-1 focus:ring-${color}-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Line total ── */}
        {item.quantity > 0 && item.unitPrice > 0 && (
          <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-sm">
            <span className="text-gray-400">
              {item.quantity} × {formatCurrency(item.unitPrice)}
              {item.gstRate > 0 && ` + ${item.gstRate}% GST`}
            </span>
            <span className="font-bold text-gray-800">{formatCurrency(lineTotal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function PurchaseInvoiceCreate() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { addPurchaseInvoice, updatePurchaseInvoice, getPurchaseInvoice } = useInvoices();
  const { active: products, refresh: refreshProducts } = useProducts();
  const { active: suppliers } = useSuppliers();
  const { settings } = useSettings();
  const isEdit = !!id;
  const lock = useInvoiceLock('purchases', isEdit ? id : null);

  // Fetch next SKU from backend so user can see what will be assigned
  const [nextSku, setNextSku] = useState(null);
  useEffect(() => {
    api('/counters').then(d => setNextSku(d.sku ?? 1001)).catch(() => setNextSku(null));
  }, []);

  const fileInputRef = useRef(null);

  const [supplierId, setSupplierId]     = useState('');
  const [supplierInvNo, setSupplierInvNo] = useState('');
  const [date, setDate]                 = useState(today());
  const [items, setItems]               = useState([{ ...BLANK_ITEM }]);
  const [notes, setNotes]               = useState('');
  const [amountPaid, setAmountPaid]     = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [billDiscount, setBillDiscount] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDrop, setShowSupplierDrop] = useState(false);

  useEffect(() => {
    if (isEdit) {
      const inv = getPurchaseInvoice(id);
      if (inv) {
        setSupplierId(inv.supplierId || '');
        setSupplierInvNo(inv.supplierInvoiceNumber || '');
        setDate(inv.date);
        // Parse items — context stores them as a JSON string (SQLite), not an array
        const parsedItems = Array.isArray(inv.items)
          ? inv.items
          : (() => { try { return JSON.parse(inv.items || '[]'); } catch { return []; } })();
        // Force isNew: false when editing — items were already created on first save
        setItems(parsedItems.length ? parsedItems.map(i => ({ ...BLANK_ITEM, ...i, isNew: false })) : [{ ...BLANK_ITEM }]);
        setNotes(inv.notes || '');
        setAmountPaid(inv.amountPaid || '');
        setPaymentMethod(inv.paymentMethod || 'cash');
        setBillDiscount(inv.billDiscount || '');
        const sup = suppliers.find(s => s.id === (inv.supplierId || ''));
        if (sup) setSupplierSearch(sup.name);
      }
    }
  }, [id]);

  const supplier = suppliers.find(s => s.id === supplierId);

  // When supplier changes, recalc prices for all existing items
  const handleSupplierChange = (sid) => {
    setSupplierId(sid);
    const sup = suppliers.find(s => s.id === sid);
    if (!sup) return;
    setItems(prev => prev.map(item => ({
      ...item,
      pricing: calcSellingPrices(item.unitPrice, sup.margin, sup.discount),
    })));
  };

  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      if (field === '_bulk') return { ...item, ...value };
      if (field === 'pricing') return { ...item, pricing: value };
      return { ...item, [field]: value };
    }));
  };

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const addItem    = () => setItems(prev => [...prev, { ...BLANK_ITEM, pricing: calcSellingPrices(0, supplier?.margin, supplier?.discount) }]);

  // Build totals only for valid items
  const validItems = items.filter(i => (i.productId || (i.isNew && i.productName)) && i.quantity > 0);
  const totals = buildInvoiceTotals(validItems.map(i => ({ ...i, unitPrice: i.unitPrice })), false);

  /* ── Excel upload ─────────────────────────────────────────────────── */
  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rows.length) { toast.error('Sheet appears to be empty'); return; }

        const sup = suppliers.find(s => s.id === supplierId);
        const newItems = rows.map(row => {
          // Flexible column name matching
          const name = String(row['Name'] || row['Product'] || row['Item'] || row['Description'] || row['name'] || '').trim();
          const sku  = String(row['SKU'] || row['Code'] || row['Item Code'] || row['code'] || row['sku'] || '').trim();
          const cat  = String(row['Category'] || row['Cat'] || row['category'] || '').trim();
          const unit = String(row['Unit'] || row['UOM'] || row['unit'] || 'Pcs').trim();
          const hsn  = String(row['HSN'] || row['HSN Code'] || row['hsn'] || '').trim();
          const gst  = +(row['GST%'] || row['GST'] || row['Tax%'] || row['gst'] || 0);
          const qty  = +(row['Qty'] || row['Quantity'] || row['quantity'] || row['qty'] || 1);
          const cost = +(row['Cost'] || row['Rate'] || row['Price'] || row['cost'] || row['rate'] || 0);

          if (!name) return null;

          // Try to match existing product by SKU or name
          const existing = products.find(p =>
            (sku && p.sku === sku) ||
            p.name?.toLowerCase() === name.toLowerCase()
          );

          const pricing = calcSellingPrices(cost || (existing?.costPrice || 0), sup?.margin, sup?.discount);

          if (existing) {
            return {
              ...BLANK_ITEM,
              isNew: false,
              productId: existing.id,
              productName: existing.name,
              sku: existing.sku || '',
              category: existing.category || cat,
              unit: existing.unit || unit,
              hsnCode: existing.hsnCode || hsn,
              gstRate: existing.gstRate ?? gst,
              quantity: qty,
              unitPrice: cost || existing.costPrice || 0,
              pricing,
            };
          } else {
            return {
              ...BLANK_ITEM,
              isNew: true,
              productName: name,
              sku,  // may be empty — auto-assigned on save
              category: cat,
              unit,
              hsnCode: hsn,
              gstRate: isNaN(gst) ? 0 : gst,
              quantity: qty,
              unitPrice: cost,
              pricing,
            };
          }
        }).filter(Boolean);

        if (!newItems.length) { toast.error('No valid rows found. Ensure the sheet has a "Name" column.'); return; }
        setItems(newItems);
        toast.success(`Loaded ${newItems.length} item${newItems.length > 1 ? 's' : ''} from Excel`);
      } catch (err) {
        console.error(err);
        toast.error('Could not parse Excel file. Check the format.');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ''; // reset so same file can be re-uploaded
  };

  const handleSave = async (status) => {
    if (!supplierId) { toast.error('Select a supplier'); return; }
    if (validItems.length === 0) { toast.error('Add at least one item with name and quantity'); return; }
    for (const item of validItems) {
      if (item.isNew && !item.productName.trim()) { toast.error('All new items need a product name'); return; }
    }

    const paid = +amountPaid || 0;
    const invData = {
      supplierInvoiceNumber: supplierInvNo,
      date, supplierId, supplierName: supplier?.name || '',
      items: validItems,
      amountPaid: paid, paymentMethod, notes,
      billDiscount: +billDiscount || 0,
    };

    try {
      if (isEdit) {
        await updatePurchaseInvoice(id, invData);
        await refreshProducts(); // stock & pricing changed on backend — sync frontend
        toast.success('Invoice updated');
        navigate('/purchases');
        return;
      }
      // Backend auto-issues on create — no separate issue call needed
      const saved = await addPurchaseInvoice({ ...invData, status: 'draft' });
      toast.success(`${saved.invoiceNumber} issued · Stock & prices updated`);
      setTimeout(() => navigate(`/purchases/${saved.id}`), 400);
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (lock.blocked) {
    return (
      <div className="max-w-4xl">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate('/purchases')} className="text-gray-400 hover:text-gray-600">←</button>
          <h1 className="text-2xl font-bold text-gray-900">Purchase Invoice (View Only)</h1>
        </div>
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 flex items-start gap-4">
          <span className="text-3xl">🔒</span>
          <div>
            <p className="font-semibold text-amber-800 text-lg">Invoice is being edited by {lock.lockedBy}</p>
            <p className="text-amber-700 text-sm mt-1">This invoice is currently open for editing on another device. You can view it below but cannot make changes until they are done.</p>
            <button onClick={() => navigate(`/purchases/${id}`)} className="mt-3 px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 font-medium">View Invoice →</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toast toasts={toast.toasts} remove={toast.remove} />
      <div className="max-w-4xl space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/purchases')} className="text-gray-400 hover:text-gray-600">←</button>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Purchase' : 'New Purchase Invoice'}</h1>
        </div>

        {/* Supplier + Invoice details */}
        <div className="grid grid-cols-2 gap-5">
          <Card>
            <h3 className="font-semibold text-gray-800 mb-3">Supplier</h3>
            {/* Searchable supplier dropdown */}
            <div className="relative">
              <label className="text-sm font-medium text-gray-700 block mb-1">Select Supplier *</label>
              <input
                value={supplierSearch}
                onChange={e => { setSupplierSearch(e.target.value); setShowSupplierDrop(true); }}
                onFocus={() => setShowSupplierDrop(true)}
                onBlur={() => setTimeout(() => setShowSupplierDrop(false), 150)}
                placeholder="Type to search supplier…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {showSupplierDrop && (
                <div className="absolute z-30 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
                  {suppliers
                    .filter(s => !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase()) || (s.code && s.code.toLowerCase().includes(supplierSearch.toLowerCase())) || (s.place && s.place.toLowerCase().includes(supplierSearch.toLowerCase())))
                    .map(s => (
                      <div
                        key={s.id}
                        className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer"
                        onMouseDown={() => { handleSupplierChange(s.id); setSupplierSearch(s.name); setShowSupplierDrop(false); }}
                      >
                        <p className="text-sm font-semibold text-gray-800">{s.code ? <span className="text-xs text-gray-400 font-mono mr-1">[{s.code}]</span> : null}{s.name}</p>
                        {s.place && <p className="text-xs text-gray-400">{s.place}</p>}
                      </div>
                    ))
                  }
                  {suppliers.filter(s => !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase()) || (s.code && s.code.toLowerCase().includes(supplierSearch.toLowerCase()))).length === 0 && (
                    <p className="px-4 py-3 text-sm text-gray-400">No suppliers found</p>
                  )}
                </div>
              )}
            </div>
            {supplier && (
              <div className="mt-3 p-3 bg-green-50 rounded-xl text-sm space-y-1">
                <p className="font-semibold text-green-800">{supplier.name}</p>
                <p className="text-green-600 text-xs">{supplier.phone}{supplier.place ? ` · ${supplier.place}` : ''}</p>
                {(supplier.margin?.wholesale || supplier.margin?.shop || supplier.margin?.retail) ? (
                  <div className="flex gap-3 pt-1 text-xs font-medium">
                    <span className="text-blue-600">W: {supplier.margin.wholesale || 0}%</span>
                    <span className="text-purple-600">S: {supplier.margin.shop || 0}%</span>
                    <span className="text-green-600">R: {supplier.margin.retail || 0}%</span>
                    {supplier.discount > 0 && <span className="text-gray-500">· {supplier.discount}% disc</span>}
                  </div>
                ) : (
                  <p className="text-xs text-yellow-600">⚠ No margins set — <a href={`/suppliers/${supplier.id}/edit`} className="underline">set now</a></p>
                )}
              </div>
            )}
          </Card>

          <Card>
            <h3 className="font-semibold text-gray-800 mb-3">Invoice Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} />
              <Input label="Supplier Invoice #" value={supplierInvNo} onChange={e => setSupplierInvNo(e.target.value)} placeholder="Supplier's ref" />
              <Select label="Payment Method" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank">Bank Transfer</option>
                <option value="credit">Credit</option>
              </Select>
              <Input label="Amount Paid (₹)" type="number" min="0" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} placeholder="0" />
            </div>
          </Card>
        </div>

        {/* Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold text-gray-800">
              Items
              <span className="ml-2 text-xs text-gray-400 font-normal">
                Selling prices auto-calculate from supplier margins — you can override them
              </span>
            </h3>
            <div className="flex items-center gap-2">
              {/* Excel upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleExcelUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-green-300 text-green-700 bg-green-50 hover:bg-green-100 rounded-lg font-medium transition-colors"
                title="Upload Excel file to bulk-import items. Columns: Name, SKU, Category, Unit, HSN, GST%, Qty, Cost"
              >
                📤 Upload Excel
              </button>
            </div>
          </div>

          {/* Excel format hint */}
          <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 border border-dashed border-gray-200">
            <span className="font-medium text-gray-500">Excel format:</span>{' '}
            Columns — <code className="font-mono bg-gray-100 px-1 rounded">Name</code>,{' '}
            <code className="font-mono bg-gray-100 px-1 rounded">SKU</code> (optional),{' '}
            <code className="font-mono bg-gray-100 px-1 rounded">Category</code>,{' '}
            <code className="font-mono bg-gray-100 px-1 rounded">Unit</code>,{' '}
            <code className="font-mono bg-gray-100 px-1 rounded">HSN</code>,{' '}
            <code className="font-mono bg-gray-100 px-1 rounded">GST%</code>,{' '}
            <code className="font-mono bg-gray-100 px-1 rounded">Qty</code>,{' '}
            <code className="font-mono bg-gray-100 px-1 rounded">Cost</code>{' '}
            — Existing products are matched by SKU or name automatically.
          </div>

          {items.map((item, idx) => (
            <ItemCard
              key={idx}
              item={item}
              idx={idx}
              supplier={supplier}
              products={products}
              nextSku={nextSku !== null ? nextSku + idx : null}
              onUpdate={(field, value) => updateItem(idx, field, value)}
              onRemove={() => removeItem(idx)}
            />
          ))}

          {/* + Add Item — placed after last item for easy access */}
          <button
            type="button"
            onClick={addItem}
            className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            + Add Item
          </button>
        </div>

        {/* Totals */}
        {validItems.length > 0 && (
          <Card>
            <div className="flex justify-end">
              <div className="w-72 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
                {totals.totalDiscount > 0 && (
                  <div className="flex justify-between text-orange-600"><span>Item Discount</span><span>− {formatCurrency(totals.totalDiscount)}</span></div>
                )}
                <div className="flex justify-between"><span className="text-gray-500">GST</span><span>{formatCurrency(totals.totalGST)}</span></div>
                {totals.roundOff !== 0 && (
                  <div className="flex justify-between text-gray-400"><span>Round Off</span><span>{totals.roundOff > 0 ? '+' : ''}{formatCurrency(totals.roundOff)}</span></div>
                )}
                {/* Bill-level discount */}
                <div className="flex items-center gap-2 border-t pt-2">
                  <span className="text-gray-500 whitespace-nowrap">Bill Discount (₹)</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={billDiscount}
                    onChange={e => setBillDiscount(e.target.value)}
                    placeholder="0"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm text-right font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div className="flex justify-between font-bold text-base border-t pt-2">
                  <span>Grand Total</span>
                  <span className="text-green-700">{formatCurrency(Math.max(0, totals.grandTotal - (+billDiscount || 0)))}</span>
                </div>
                {+amountPaid > 0 && (
                  <div className="flex justify-between text-green-600"><span>Paid</span><span>{formatCurrency(+amountPaid)}</span></div>
                )}
                {+amountPaid < Math.max(0, totals.grandTotal - (+billDiscount || 0)) && (
                  <div className="flex justify-between text-red-600 font-medium">
                    <span>Balance Due</span><span>{formatCurrency(Math.max(0, totals.grandTotal - (+billDiscount || 0)) - (+amountPaid || 0))}</span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        <Card><Textarea label="Notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any remarks…" /></Card>

        <div className="flex justify-end gap-3 pb-10">
          <Button variant="secondary" onClick={() => navigate('/purchases')}>Cancel</Button>
          <Button variant="success" onClick={() => handleSave('issued')}>
            Save & Add to Stock
          </Button>
        </div>
      </div>
    </>
  );
}
