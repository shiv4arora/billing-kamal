import { useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { api } from '../hooks/useApi';
import { Button, Input, Textarea, Card, useToast, Toast } from '../components/ui';

const SCHEDULE_OPTIONS = [
  { value: 0, label: 'On due date' },
  { value: 1, label: '+1 day' },
  { value: 3, label: '+3 days' },
  { value: 7, label: '+7 days' },
  { value: 14, label: '+14 days' },
  { value: 30, label: '+30 days' },
];

function ReminderSchedulePicker({ schedule, onChange }) {
  const toggle = (val) => {
    const next = schedule.includes(val) ? schedule.filter(v => v !== val) : [...schedule, val].sort((a, b) => a - b);
    onChange(next);
  };
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {SCHEDULE_OPTIONS.map(opt => (
        <button key={opt.value} type="button" onClick={() => toggle(opt.value)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            schedule.includes(opt.value)
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
          }`}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}
import { GST_RATES } from '../constants';

export default function Settings() {
  const { settings, update } = useSettings();
  const toast = useToast();
  const [logo, setLogo] = useState(settings.company.logo || null);

  const set = (path, value) => update(path, value);

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => { const b64 = reader.result; setLogo(b64); set('company.logo', b64); };
    reader.readAsDataURL(file);
  };

  const handleSave = () => toast.success('Settings saved!');

  const exportData = async () => {
    try {
      const data = await api('/admin/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'billing_backup.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error('Export failed: ' + e.message); }
  };

  const importData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const data = JSON.parse(reader.result);
        await api('/admin/import', { method: 'POST', body: data });
        toast.success('Data imported! Refresh the page.');
      } catch { toast.error('Invalid backup file or import failed'); }
    };
    reader.readAsText(file);
  };

  return (
    <>
      <Toast toasts={toast.toasts} remove={toast.remove} />
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Company Information</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {logo && <img src={logo} alt="logo" className="h-14 w-14 object-contain border rounded-lg" />}
              <div><label className="text-sm font-medium text-gray-700 block mb-1">Company Logo</label><input type="file" accept="image/*" onChange={handleLogoUpload} className="text-sm text-gray-600" /></div>
            </div>
            <Input label="Company Name" value={settings.company.name} onChange={e => set('company.name', e.target.value)} />
            <Textarea label="Address" value={settings.company.address} onChange={e => set('company.address', e.target.value)} rows={3} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Phone" value={settings.company.phone} onChange={e => set('company.phone', e.target.value)} />
              <Input label="Email" value={settings.company.email} onChange={e => set('company.email', e.target.value)} />
              <Input label="GSTIN" value={settings.company.gstin} onChange={e => set('company.gstin', e.target.value)} />
              <Input label="State" value={settings.company.state} onChange={e => set('company.state', e.target.value)} />
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Invoice Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Sale Invoice Prefix" value={settings.invoice.salePrefix} onChange={e => set('invoice.salePrefix', e.target.value)} />
            <Input label="Purchase Invoice Prefix" value={settings.invoice.purchasePrefix} onChange={e => set('invoice.purchasePrefix', e.target.value)} />
            <Input label="Default Due Days" type="number" value={settings.invoice.defaultDueDays} onChange={e => set('invoice.defaultDueDays', +e.target.value)} />
            <Input label="Low Stock Threshold (global)" type="number" value={settings.lowStockThreshold} onChange={e => set('lowStockThreshold', +e.target.value)} />
            <div className="col-span-2 flex items-center gap-3">
              <input type="checkbox" id="showHSN" checked={settings.invoice.showHSN} onChange={e => set('invoice.showHSN', e.target.checked)} className="rounded" />
              <label htmlFor="showHSN" className="text-sm text-gray-700">Show HSN/SAC Code on invoices</label>
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <input type="checkbox" id="intraState" checked={settings.tax.intraState} onChange={e => set('tax.intraState', e.target.checked)} className="rounded" />
              <label htmlFor="intraState" className="text-sm text-gray-700">Intra-state (CGST + SGST) — uncheck for inter-state (IGST)</label>
            </div>
          </div>
          <Textarea label="Bank Details (shown on invoice)" className="mt-4" value={settings.invoice.bankDetails} onChange={e => set('invoice.bankDetails', e.target.value)} rows={3} placeholder="Bank: XYZ&#10;A/C: 123456&#10;IFSC: XYZB0001" />
          <Textarea label="Terms & Conditions" className="mt-4" value={settings.invoice.terms} onChange={e => set('invoice.terms', e.target.value)} rows={2} />
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Payment Reminders</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Auto-remind via WhatsApp</p>
                <p className="text-xs text-gray-400 mt-0.5">When enabled, overdue invoices appear in Reminders with one-click WhatsApp send</p>
              </div>
              <button
                type="button"
                onClick={() => set('reminders.enabled', !settings.reminders?.enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.reminders?.enabled ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  settings.reminders?.enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Reminder schedule</p>
              <p className="text-xs text-gray-400 mb-2">Send reminders on these days after the invoice due date</p>
              <ReminderSchedulePicker
                schedule={settings.reminders?.schedule || [0, 3, 7]}
                onChange={val => set('reminders.schedule', val)}
              />
            </div>

            <div>
              <Textarea
                label="Message template"
                value={settings.reminders?.messageTemplate || ''}
                onChange={e => set('reminders.messageTemplate', e.target.value)}
                rows={5}
                placeholder={`Dear {customer},\n\nThis is a reminder that invoice *{invoiceNo}* dated {date} amounting to *{amount}* is overdue.\n\nBalance Due: *{balance}*\n\nKindly arrange payment at the earliest.\n\nRegards,\n{company}`}
              />
              <p className="text-xs text-gray-400 mt-1">
                Variables: <code className="bg-gray-100 px-1 rounded">{'{customer}'}</code>{' '}
                <code className="bg-gray-100 px-1 rounded">{'{invoiceNo}'}</code>{' '}
                <code className="bg-gray-100 px-1 rounded">{'{date}'}</code>{' '}
                <code className="bg-gray-100 px-1 rounded">{'{amount}'}</code>{' '}
                <code className="bg-gray-100 px-1 rounded">{'{balance}'}</code>{' '}
                <code className="bg-gray-100 px-1 rounded">{'{company}'}</code>
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Data Management</h3>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={exportData}>⬇ Export Backup</Button>
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-200">
              ⬆ Import Backup <input type="file" accept=".json" onChange={importData} className="hidden" />
            </label>
          </div>
          <p className="text-xs text-gray-400 mt-2">Backup exports all data as JSON. Import will overwrite existing data.</p>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave}>Save Settings</Button>
        </div>
      </div>
    </>
  );
}
