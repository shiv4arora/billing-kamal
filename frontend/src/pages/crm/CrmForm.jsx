import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeads } from '../../context/LeadContext';
import { Button, Input, Select, Textarea, Card } from '../../components/ui';
import { useGlobalToast } from '../../context/ToastContext';
import { today } from '../../utils/helpers';
import { useUnsavedChanges, UnsavedChangesModal } from '../../hooks/useUnsavedChanges';

const STAGES = [
  { value: 'lead',      label: 'Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'catalogue', label: 'Send Catalogue' },
  { value: 'visit',     label: 'Visit / Video Call' },
  { value: 'followup2', label: 'Follow Up for 2nd Order' },
  { value: 'won',       label: 'Won' },
];

export default function CrmForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useGlobalToast();
  const { addLead, updateLead, getLead } = useLeads();
  const isEdit = !!id;

  const [form, setForm] = useState({
    name: '', phone: '', place: '',
    source: 'whatsapp', stage: 'lead',
    nextFollowUp: today(), visitDate: '', noteText: '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [isDirty, setIsDirty] = useState(false);
  const blocker = useUnsavedChanges(isDirty);

  useEffect(() => {
    if (isEdit) {
      const lead = getLead(id);
      if (lead) {
        setForm({
          name: lead.name || '',
          phone: lead.phone || '',
          place: lead.place || '',
          source: lead.source || 'whatsapp',
          stage: lead.stage || 'lead',
          nextFollowUp: lead.nextFollowUp || '',
          visitDate: lead.visitDate || '',
          noteText: '',
        });
      }
    }
  }, [id]);

  const set = (k, v) => { setIsDirty(true); setForm(p => ({ ...p, [k]: v })); };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        place: form.place.trim(),
        source: form.source,
        stage: form.stage,
        nextFollowUp: form.nextFollowUp || null,
        visitDate: form.visitDate || null,
      };

      if (form.noteText.trim()) {
        const existing = isEdit ? (() => { try { return JSON.parse(getLead(id)?.notes || '[]'); } catch { return []; } })() : [];
        data.notes = JSON.stringify([...existing, { text: form.noteText.trim(), createdAt: new Date().toISOString() }]);
      }

      if (isEdit) {
        await updateLead(id, data);
        toast.success('Lead updated');
      } else {
        await addLead(data);
        toast.success('Lead added');
      }
      setIsDirty(false);
      navigate('/crm');
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <UnsavedChangesModal blocker={blocker} />
    <div className="max-w-lg space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/crm')} className="text-gray-400 hover:text-gray-600">←</button>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Lead' : 'New Lead'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Contact Info</h3>
          <div className="space-y-3">
            <Input label="Name *" value={form.name} onChange={e => set('name', e.target.value)} error={errors.name} placeholder="Lead's name or business" />
            <Input label="Phone" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="Mobile number" />
            <Input label="Place / City" value={form.place} onChange={e => set('place', e.target.value)} placeholder="City or area" />
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Lead Details</h3>
          <div className="space-y-3">
            <Select label="Source" value={form.source} onChange={e => set('source', e.target.value)}>
              <option value="whatsapp">💬 WhatsApp</option>
              <option value="call">📞 Call</option>
              <option value="walkin">🚶 Walk-in</option>
              <option value="other">📝 Other</option>
            </Select>
            <Select label="Stage" value={form.stage} onChange={e => set('stage', e.target.value)}>
              {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
            <Input label="Next Follow-up Date" type="date" value={form.nextFollowUp} onChange={e => set('nextFollowUp', e.target.value)} />
            <Input label="Visit Date (if scheduled)" type="date" value={form.visitDate} onChange={e => set('visitDate', e.target.value)} />
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Add Note</h3>
          <Textarea
            label="Note (optional)"
            value={form.noteText}
            onChange={e => set('noteText', e.target.value)}
            rows={3}
            placeholder="e.g. Called, said will check and get back…"
          />
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate('/crm')}>Cancel</Button>
          <Button type="submit" disabled={saving}>{isEdit ? 'Save Changes' : 'Add Lead'}</Button>
        </div>
      </form>
    </div>
    </>
  );
}
