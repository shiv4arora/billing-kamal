import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSuppliers } from '../../context/SupplierContext';
import { Button, Input, Textarea, Card } from '../../components/ui';

const BLANK = {
  name: '', code: '', place: '', phone: '', contactPerson: '', email: '',
  address: '', gstin: '', isActive: true,
  discount: 0,                                    // % discount supplier gives us on their invoice
  margin: { wholesale: 0, shop: 0 },              // % markup over cost → selling price
};

// Auto-generate a short code from supplier name (first 3-4 uppercase letters)
function autoCode(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0] + (words[2]?.[0] || words[1][1] || '')).toUpperCase().slice(0, 4);
  return name.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);
}

export default function SupplierForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { add, update, get } = useSuppliers();
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const isEdit = !!id;

  useEffect(() => {
    if (isEdit) {
      const s = get(id);
      if (s) setForm({ ...BLANK, ...s, margin: { wholesale: s.margin?.wholesale ?? 0, shop: s.margin?.shop ?? 0 } });
    }
  }, [id]);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const setMargin = (tier, v) => setForm(p => ({ ...p, margin: { ...p.margin, [tier]: v } }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.phone.trim()) e.phone = 'Contact number is required';
    if (!form.place.trim()) e.place = 'Place is required';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    const data = { ...form, discount: +form.discount || 0, margin: { wholesale: +form.margin.wholesale || 0, shop: +form.margin.shop || 0 } };
    if (isEdit) update(id, data); else add(data);
    navigate('/suppliers');
  };

  // Example preview: at ₹100 cost, what selling prices result?
  const exampleCost = 100;
  const exCost = exampleCost * (1 - (+form.discount || 0) / 100);
  const ex = {
    wholesale: +(exCost * (1 + (+form.margin.wholesale || 0) / 100)).toFixed(2),
    shop:      +(exCost * (1 + (+form.margin.shop      || 0) / 100)).toFixed(2),
  };

  return (
    <div className="max-w-lg space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/suppliers')} className="text-gray-400 hover:text-gray-600">←</button>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Supplier' : 'Add Supplier'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basic */}
        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Basic Details</h3>
          <div className="space-y-4">
            <Input
              label="Supplier / Company Name *"
              value={form.name}
              onChange={e => {
                const name = e.target.value;
                set('name', name);
                // Auto-fill code only if user hasn't manually set it
                if (!form.code || form.code === autoCode(form.name)) {
                  setForm(p => ({ ...p, name, code: autoCode(name) }));
                }
              }}
              error={errors.name}
              placeholder="e.g. AgriCo Distributors"
            />
            <Input
              label="Short Code"
              value={form.code}
              onChange={e => set('code', e.target.value.toUpperCase().slice(0, 6))}
              placeholder="e.g. AGR, TCS"
              maxLength={6}
            />
            <p className="text-xs text-gray-400 -mt-2">Auto-generated from name. You can change it. Used as a quick reference code.</p>
            <Input label="Place *" value={form.place} onChange={e => set('place', e.target.value)} error={errors.place} placeholder="e.g. Nasik, Chennai" />
            <Input label="Contact Number *" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} error={errors.phone} placeholder="e.g. 9123456789" />
          </div>
        </Card>

        {/* Margins — the key new card */}
        <Card>
          <h3 className="font-semibold text-gray-800 mb-1">Pricing Margins</h3>
          <p className="text-sm text-gray-500 mb-4">
            Define how selling prices are auto-calculated from purchase cost. <br />
            Selling price = Cost × (1 + Margin %)
          </p>

          {/* Supplier discount */}
          <div className="mb-4">
            <Input
              label="Supplier Discount % (on invoice)"
              type="number" min="0" max="100" step="0.1"
              value={form.discount}
              onChange={e => set('discount', e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-gray-400 mt-1">Discount the supplier gives you on their listed price</p>
          </div>

          {/* Margin tiers */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { tier: 'wholesale', label: 'Wholesale Margin', color: 'blue' },
              { tier: 'shop',      label: 'Shop Margin',      color: 'purple' },
            ].map(({ tier, label, color }) => (
              <div key={tier} className={`bg-${color}-50 border border-${color}-100 rounded-xl p-3`}>
                <p className={`text-xs font-bold text-${color}-600 uppercase tracking-wide mb-2`}>{label}</p>
                <div className="flex items-center gap-1">
                  <input
                    type="number" min="0" max="500" step="0.1"
                    value={form.margin[tier]}
                    onChange={e => setMargin(tier, e.target.value)}
                    placeholder="0"
                    className={`w-full bg-white border border-${color}-200 rounded-lg px-2 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-${color}-400`}
                  />
                  <span className={`text-sm font-bold text-${color}-600`}>%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Live preview */}
          <div className="mt-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500 font-medium mb-2">
              Preview — if purchase cost = ₹{exampleCost}
              {+form.discount > 0 && ` (after ${form.discount}% discount = ₹${exCost.toFixed(2)})`}:
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                { label: 'Wholesale', val: ex.wholesale, color: 'text-blue-700' },
                { label: 'Shop',      val: ex.shop,      color: 'text-purple-700' },
              ].map(r => (
                <div key={r.label} className="text-center">
                  <p className="text-xs text-gray-400">{r.label}</p>
                  <p className={`font-bold ${r.color}`}>₹{r.val}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Additional */}
        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Additional Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Contact Person" value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} className="col-span-2" />
            <Input label="Email" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            <Input label="GSTIN" value={form.gstin} onChange={e => set('gstin', e.target.value)} />
            <div className="col-span-2">
              <Textarea label="Full Address" value={form.address} onChange={e => set('address', e.target.value)} rows={3} />
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate('/suppliers')}>Cancel</Button>
          <Button type="submit">{isEdit ? 'Update Supplier' : 'Add Supplier'}</Button>
        </div>
      </form>
    </div>
  );
}
