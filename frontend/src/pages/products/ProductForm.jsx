import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useUnsavedChanges, UnsavedChangesModal } from '../../hooks/useUnsavedChanges.jsx';
import { useProducts } from '../../context/ProductContext';
import { useSuppliers } from '../../context/SupplierContext';
import { Button, Input, Select, Card } from '../../components/ui';
import { GST_RATES, UNITS } from '../../constants';
import { api } from '../../hooks/useApi';

const BLANK = {
  name: '', unit: 'Pcs', description: '',
  pricing: { wholesale: '', shop: '' },
  costPrice: '', gstRate: 0, hsnCode: '', supplierId: '',
  currentStock: 0, lowStockThreshold: 10, isActive: true,
};

// Auto-calculate selling prices from cost + supplier margin %
function calcPrices(cost, supplier) {
  const c = +cost || 0;
  const margin = supplier?.margin || {};
  const discount = supplier?.discount || 0;
  const netCost = c * (1 - discount / 100);
  return {
    wholesale: +((netCost * (1 + (margin.wholesale || 0) / 100)).toFixed(2)),
    shop:      +((netCost * (1 + (margin.shop      || 0) / 100)).toFixed(2)),
  };
}

export default function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { add, update, get } = useProducts();
  const { active: suppliers } = useSuppliers();
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [previewSku, setPreviewSku] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const isEdit = !!id;
  const confirmLeave = useUnsavedChanges(isDirty);

  useEffect(() => {
    if (isEdit) {
      const p = get(id);
      if (p) setForm({
        ...BLANK, ...p,
        pricing: { wholesale: p.pricing?.wholesale ?? '', shop: p.pricing?.shop ?? '' },
      });
    } else {
      api('/counters').then(d => setPreviewSku(d.sku ?? 1001)).catch(() => setPreviewSku(1001));
    }
  }, [id]);

  const set = (field, value) => { setIsDirty(true); setForm(f => ({ ...f, [field]: value })); };
  const setPrice = (tier, value) => { setIsDirty(true); setForm(f => ({ ...f, pricing: { ...f.pricing, [tier]: value } })); };

  // When cost price changes, auto-fill selling prices from supplier margin
  const handleCostChange = (value) => {
    set('costPrice', value);
    const supplier = suppliers.find(s => s.id === form.supplierId);
    if (supplier && (supplier.margin?.wholesale || supplier.margin?.shop)) {
      const prices = calcPrices(value, supplier);
      setForm(f => ({ ...f, costPrice: value, pricing: {
        wholesale: prices.wholesale || f.pricing.wholesale,
        shop:      prices.shop      || f.pricing.shop,
      }}));
    }
  };

  // When supplier changes, recalculate prices if cost price is already set
  const handleSupplierChange = (sid) => {
    set('supplierId', sid);
    const supplier = suppliers.find(s => s.id === sid);
    if (supplier && form.costPrice) {
      const prices = calcPrices(form.costPrice, supplier);
      setForm(f => ({ ...f, supplierId: sid, pricing: {
        wholesale: prices.wholesale || f.pricing.wholesale,
        shop:      prices.shop      || f.pricing.shop,
      }}));
    }
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.pricing.shop) e.shopPrice = 'Shop price is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const data = {
      ...form,
      pricing: { wholesale: +form.pricing.wholesale || 0, shop: +form.pricing.shop || 0 },
      costPrice: +form.costPrice || 0,
      gstRate: +form.gstRate,
      currentStock: +form.currentStock || 0,
      lowStockThreshold: +form.lowStockThreshold || 10,
    };
    // Never send sku on create — backend auto-assigns next sequential number
    if (isEdit) {
      await update(id, data);
    } else {
      const { sku: _drop, ...createData } = data;
      await add(createData);
    }
    setIsDirty(false);
    navigate('/products');
  };

  return (
    <>
    <UnsavedChangesModal blocker={blocker} />
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => { if (confirmLeave()) navigate('/products'); }} className="text-gray-400 hover:text-gray-600">←</button>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Product' : 'Add Product'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Basic Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Product Name *" value={form.name} onChange={e => set('name', e.target.value)} error={errors.name} className="col-span-2" />

            {/* SKU ID — assigned automatically when first purchase is completed */}
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 block mb-1">SKU ID</label>
              <div className="flex items-center gap-2 w-full border border-blue-200 bg-blue-50 rounded-lg px-3 py-2">
                <span className="text-xs bg-blue-600 text-white font-semibold px-2 py-0.5 rounded-full">AUTO</span>
                <span className="text-base font-mono font-bold text-blue-800 tracking-widest">
                  {isEdit
                    ? (form.sku ? form.sku : '— not yet assigned —')
                    : (previewSku !== null ? String(previewSku) : '…')}
                </span>
                {!isEdit && previewSku !== null && (
                  <span className="ml-auto text-xs text-blue-500 italic">will be assigned on first purchase</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {isEdit ? 'SKU ID is assigned automatically when a purchase invoice is completed.' : 'This SKU ID will be auto-assigned when the first purchase invoice for this product is completed.'}
              </p>
            </div>

            <Select label="Unit" value={form.unit} onChange={e => set('unit', e.target.value)}>
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </Select>
            <Input label="HSN/SAC Code" value={form.hsnCode} onChange={e => set('hsnCode', e.target.value)} placeholder="e.g. 1006" />

            <Select label="Supplier" value={form.supplierId} onChange={e => handleSupplierChange(e.target.value)}>
              <option value="">— No Supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.place ? ` (${s.place})` : ''}</option>)}
            </Select>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-800 mb-1">Pricing</h3>
          <p className="text-sm text-gray-500 mb-4">
            Enter cost price first — if a supplier with margins is selected, selling prices auto-fill.
          </p>

          {/* Cost price — drives auto-calculation */}
          <div className="mb-4">
            <Input
              label="Cost Price (Purchase Rate)"
              type="number" min="0" step="0.01"
              value={form.costPrice}
              onChange={e => handleCostChange(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">Wholesale</p>
              <input type="number" min="0" step="0.01" value={form.pricing.wholesale}
                onChange={e => setPrice('wholesale', e.target.value)} placeholder="0.00"
                className="w-full bg-white border border-blue-200 rounded-lg px-3 py-2 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
              <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-2">Shop *</p>
              <input type="number" min="0" step="0.01" value={form.pricing.shop}
                onChange={e => setPrice('shop', e.target.value)} placeholder="0.00"
                className={`w-full bg-white border rounded-lg px-3 py-2 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400 ${errors.shopPrice ? 'border-red-400' : 'border-purple-200'}`} />
              {errors.shopPrice && <p className="text-xs text-red-500 mt-1">{errors.shopPrice}</p>}
            </div>
          </div>

          <div className="mt-3">
            <Select label="GST Rate" value={form.gstRate} onChange={e => set('gstRate', e.target.value)}>
              {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
            </Select>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Inventory</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Opening Stock" type="number" min="0" value={form.currentStock} onChange={e => set('currentStock', e.target.value)} />
            <Input label="Low Stock Threshold" type="number" min="0" value={form.lowStockThreshold} onChange={e => set('lowStockThreshold', e.target.value)} />
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => { if (confirmLeave()) navigate('/products'); }}>Cancel</Button>
          <Button type="submit">{isEdit ? 'Update Product' : 'Add Product'}</Button>
        </div>
      </form>
    </div>
    </>
  );
}
