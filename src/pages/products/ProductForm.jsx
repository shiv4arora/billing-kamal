import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { useSuppliers } from '../../context/SupplierContext';
import { useSettings } from '../../context/SettingsContext';
import { Button, Input, Select, Card } from '../../components/ui';
import { GST_RATES, UNITS } from '../../constants';

const BLANK = {
  name: '', sku: '', category: '', unit: 'Pcs', description: '',
  pricing: { wholesale: '', shop: '', retail: '' },
  costPrice: '', gstRate: 0, hsnCode: '', supplierId: '',
  currentStock: 0, lowStockThreshold: 10, isActive: true,
};

export default function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { add, update, get } = useProducts();
  const { active: suppliers } = useSuppliers();
  const { settings, bumpSkuNo } = useSettings();
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const isEdit = !!id;

  useEffect(() => {
    if (isEdit) {
      const p = get(id);
      if (p) setForm({ ...BLANK, ...p, pricing: { wholesale: p.pricing?.wholesale ?? '', shop: p.pricing?.shop ?? '', retail: p.pricing?.retail ?? '' } });
    } else {
      // Pre-fill with the upcoming sequential code (preview only — officially bumped on submit)
      setForm(f => ({ ...f, sku: String(settings.nextSkuNo || 1001) }));
    }
  }, [id]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));
  const setPrice = (tier, value) => setForm(f => ({ ...f, pricing: { ...f.pricing, [tier]: value } }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.pricing.retail) e.retailPrice = 'Retail price is required';
    if (!form.sku.trim()) e.sku = 'Item code is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    const data = {
      ...form,
      pricing: { wholesale: +form.pricing.wholesale || 0, shop: +form.pricing.shop || 0, retail: +form.pricing.retail || 0 },
      costPrice: +form.costPrice || 0,
      gstRate: +form.gstRate,
      currentStock: +form.currentStock || 0,
      lowStockThreshold: +form.lowStockThreshold || 10,
    };
    if (isEdit) {
      update(id, data);
      navigate('/products');
    } else {
      // Bump the global sequential counter and use the returned number as the SKU
      const assignedNo = bumpSkuNo();
      const finalSku = form.sku.trim() && form.sku.trim() !== String(settings.nextSkuNo)
        ? form.sku.trim()       // user typed a custom code
        : String(assignedNo);   // use auto-sequential number
      add({ ...data, sku: finalSku });
      navigate('/products');
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/products')} className="text-gray-400 hover:text-gray-600">←</button>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Product' : 'Add Product'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Basic Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Product Name *" value={form.name} onChange={e => set('name', e.target.value)} error={errors.name} className="col-span-2" />

            {/* Sequential Item Code */}
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Item Code *
                {!isEdit && (
                  <span className="ml-2 text-xs font-normal text-blue-500">
                    Sequential — next: #{settings.nextSkuNo || 1001}
                  </span>
                )}
              </label>
              <input
                value={form.sku}
                onChange={e => set('sku', e.target.value)}
                placeholder={String(settings.nextSkuNo || 1001)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest ${errors.sku ? 'border-red-400' : 'border-gray-300'}`}
              />
              {errors.sku && <span className="text-xs text-red-500">{errors.sku}</span>}
              {!isEdit && (
                <p className="text-xs text-gray-400 mt-1">
                  Auto-assigned sequential code · Leave as-is or type a custom code
                </p>
              )}
            </div>

            <Input label="Category" value={form.category} onChange={e => set('category', e.target.value)} placeholder="e.g. Grains, Electronics" />
            <Select label="Unit" value={form.unit} onChange={e => set('unit', e.target.value)}>
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </Select>
            <Input label="HSN/SAC Code" value={form.hsnCode} onChange={e => set('hsnCode', e.target.value)} placeholder="e.g. 1006" />

            {/* Supplier linkage */}
            <Select label="Supplier" value={form.supplierId} onChange={e => set('supplierId', e.target.value)}>
              <option value="">— No Supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.place ? ` (${s.place})` : ''}</option>)}
            </Select>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-800 mb-1">Pricing (3 Tiers)</h3>
          <p className="text-sm text-gray-500 mb-4">Set different prices for wholesale, shop, and retail customers</p>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2">Wholesale</p>
              <input type="number" min="0" step="0.01" value={form.pricing.wholesale} onChange={e => setPrice('wholesale', e.target.value)} placeholder="0.00"
                className="w-full bg-white border border-blue-200 rounded-lg px-3 py-2 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
              <p className="text-xs font-bold text-purple-600 uppercase tracking-wide mb-2">Shop</p>
              <input type="number" min="0" step="0.01" value={form.pricing.shop} onChange={e => setPrice('shop', e.target.value)} placeholder="0.00"
                className="w-full bg-white border border-purple-200 rounded-lg px-3 py-2 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400" />
            </div>
            <div className="bg-green-50 border border-green-100 rounded-xl p-3">
              <p className="text-xs font-bold text-green-600 uppercase tracking-wide mb-2">Retail *</p>
              <input type="number" min="0" step="0.01" value={form.pricing.retail} onChange={e => setPrice('retail', e.target.value)} placeholder="0.00"
                className={`w-full bg-white border rounded-lg px-3 py-2 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-green-400 ${errors.retailPrice ? 'border-red-400' : 'border-green-200'}`} />
              {errors.retailPrice && <p className="text-xs text-red-500 mt-1">{errors.retailPrice}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <Input label="Cost Price" type="number" min="0" step="0.01" value={form.costPrice} onChange={e => set('costPrice', e.target.value)} placeholder="0.00" />
            <Select label="GST Rate" value={form.gstRate} onChange={e => set('gstRate', e.target.value)}>
              {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
            </Select>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Inventory</h3>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Opening Stock" type="number" min="0" value={form.currentStock} onChange={e => set('currentStock', e.target.value)} />
            <Input label="Low Stock Threshold" type="number" min="0" value={form.lowStockThreshold} onChange={e => set('lowStockThreshold', e.target.value)} />
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate('/products')}>Cancel</Button>
          <Button type="submit">{isEdit ? 'Update Product' : 'Add Product'}</Button>
        </div>
      </form>
    </div>
  );
}
