import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCustomers } from '../../context/CustomerContext';
import { Button, Input, Select, Textarea, Card } from '../../components/ui';

const BLANK = { name: '', place: '', phone: '', type: 'retail', email: '', address: '', gstin: '', creditLimit: '', isActive: true };

export default function CustomerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { add, update, get } = useCustomers();
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const isEdit = !!id;

  useEffect(() => { if (isEdit) { const c = get(id); if (c) setForm({ ...BLANK, ...c }); } }, [id]);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

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
    const data = { ...form, creditLimit: +form.creditLimit || 0 };
    if (isEdit) update(id, data); else add(data);
    navigate('/customers');
  };

  return (
    <div className="max-w-lg space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/customers')} className="text-gray-400 hover:text-gray-600">←</button>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Customer' : 'Add Customer'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Primary fields */}
        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Basic Details</h3>
          <div className="space-y-4">
            <Input label="Customer Name *" value={form.name} onChange={e => set('name', e.target.value)} error={errors.name} placeholder="e.g. Rajesh Traders" />
            <Input label="Place *" value={form.place} onChange={e => set('place', e.target.value)} error={errors.place} placeholder="e.g. Pune, Mumbai, Delhi" />
            <Input label="Contact Number *" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} error={errors.phone} placeholder="e.g. 9876543210" />
          </div>
        </Card>

        {/* Additional fields */}
        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Additional Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Customer Type" value={form.type} onChange={e => set('type', e.target.value)} className="col-span-2">
              <option value="wholesale">Wholesale (H)</option>
              <option value="shop">Shop (S)</option>
              <option value="retail">Retail (E)</option>
            </Select>
            <Input label="Email" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            <Input label="Credit Limit (₹)" type="number" value={form.creditLimit} onChange={e => set('creditLimit', e.target.value)} />
            <Input label="GSTIN" value={form.gstin} onChange={e => set('gstin', e.target.value)} className="col-span-2" />
            <div className="col-span-2">
              <Textarea label="Full Address" value={form.address} onChange={e => set('address', e.target.value)} rows={3} placeholder="Street, area, city, pincode…" />
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate('/customers')}>Cancel</Button>
          <Button type="submit">{isEdit ? 'Update Customer' : 'Add Customer'}</Button>
        </div>
      </form>
    </div>
  );
}
