import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCustomers } from '../context/CustomerContext';
import { useSettings } from '../context/SettingsContext';
import { useReminderLog, computePendingReminders } from '../context/ReminderContext';
import { Button, Card, useToast, Toast } from '../components/ui';
import { formatCurrency, formatDate } from '../utils/helpers';

function buildWhatsAppMessage(inv, customer, companyName, template) {
  const balance = (inv.grandTotal || 0) - (inv.amountPaid || 0);
  const phone = (customer?.phone || '').replace(/\D/g, '');
  const msg = (template || 'Dear {customer},\n\nThis is a reminder that invoice *{invoiceNo}* dated {date} amounting to *{amount}* is overdue.\n\nBalance Due: *{balance}*\n\nKindly arrange payment at the earliest.\n\nRegards,\n{company}')
    .replace('{customer}', inv.customerName || customer?.name || '')
    .replace('{invoiceNo}', inv.invoiceNumber || '')
    .replace('{date}', formatDate(inv.date))
    .replace('{amount}', formatCurrency(inv.grandTotal || 0))
    .replace('{balance}', formatCurrency(balance))
    .replace('{company}', companyName || 'Us');
  return { msg, phone };
}

export default function Reminders() {
  const { get: getCustomer } = useCustomers();
  const { settings, update } = useSettings();
  const { logReminderSent } = useReminderLog();
  const toast = useToast();
  const [filter, setFilter] = useState('pending'); // 'pending' | 'all'
  const [sending, setSending] = useState(false);
  const [allPending, setAllPending] = useState([]);
  const [loading, setLoading] = useState(true);

  const reminderSettings = settings.reminders || { enabled: true, schedule: [0, 3, 7], messageTemplate: '' };

  const load = async () => {
    setLoading(true);
    const list = await computePendingReminders();
    setAllPending(list);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // For "all overdue" view — show each invoice once (most urgent offset)
  const allOverdue = useMemo(() => {
    const seen = new Set();
    return allPending.filter(r => { if (seen.has(r.inv.id)) return false; seen.add(r.inv.id); return true; });
  }, [allPending]);

  const unsent = allPending.filter(r => !r.sent);
  const displayed = filter === 'pending' ? unsent : allOverdue;

  // Dedupe by invoice for display (show earliest unsent offset per invoice)
  const rows = useMemo(() => {
    const map = {};
    displayed.forEach(r => {
      if (!map[r.inv.id] || r.offset < map[r.inv.id].offset) map[r.inv.id] = r;
    });
    return Object.values(map).sort((a, b) => b.daysPastDue - a.daysPastDue);
  }, [displayed]);

  const totalOutstanding = useMemo(
    () => [...new Set(allOverdue.map(r => r.inv.id))].reduce((s, id) => {
      const inv = allOverdue.find(r => r.inv.id === id)?.inv;
      return s + ((inv?.grandTotal || 0) - (inv?.amountPaid || 0));
    }, 0),
    [allOverdue]
  );

  const sendOne = async (r) => {
    const realCust = getCustomer(r.inv.customerId);
    const { msg, phone } = buildWhatsAppMessage(r.inv, realCust, settings.company.name, reminderSettings.messageTemplate);
    const url = phone ? `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    await logReminderSent(r.inv.id, r.offset, { customerName: r.inv.customerName, invoiceNumber: r.inv.invoiceNumber });
    toast.success(`Reminder sent for ${r.inv.invoiceNumber}`);
    load(); // refresh to update sent status
  };

  const sendAll = async () => {
    if (unsent.length === 0) { toast.error('No pending reminders'); return; }
    setSending(true);
    const deduped = {};
    unsent.forEach(r => { if (!deduped[r.inv.id]) deduped[r.inv.id] = r; });
    const list = Object.values(deduped);
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      await new Promise(res => setTimeout(res, i * 600));
      const realCust = getCustomer(r.inv.customerId);
      const { msg, phone } = buildWhatsAppMessage(r.inv, realCust, settings.company.name, reminderSettings.messageTemplate);
      const url = phone ? `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
      window.open(url, '_blank');
      await logReminderSent(r.inv.id, r.offset, { customerName: r.inv.customerName, invoiceNumber: r.inv.invoiceNumber });
    }
    setSending(false);
    toast.success(`${list.length} reminder(s) sent`);
    load();
  };

  return (
    <>
      <Toast toasts={toast.toasts} remove={toast.remove} />
      <div className="max-w-5xl space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payment Reminders</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Auto-scheduled WhatsApp reminders for overdue invoices
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/settings">
              <Button variant="secondary">⚙ Reminder Settings</Button>
            </Link>
            {unsent.length > 0 && (
              <Button onClick={sendAll} disabled={sending}>
                {sending ? 'Sending…' : `📱 Send All (${[...new Set(unsent.map(r => r.inv.id))].length})`}
              </Button>
            )}
          </div>
        </div>

        {/* Settings summary */}
        <div className={`rounded-xl px-5 py-3 flex items-center gap-4 text-sm ${reminderSettings.enabled ? 'bg-green-50 border border-green-200' : 'bg-gray-100 border border-gray-200'}`}>
          <span className={`font-semibold ${reminderSettings.enabled ? 'text-green-700' : 'text-gray-500'}`}>
            {reminderSettings.enabled ? '✅ Reminders Enabled' : '⏸ Reminders Disabled'}
          </span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-600">
            Schedule: <strong>{(reminderSettings.schedule || [0, 3, 7]).map(d => d === 0 ? 'On due date' : `+${d} days`).join(', ')}</strong>
          </span>
          {!reminderSettings.enabled && (
            <button onClick={() => update('reminders.enabled', true)} className="ml-auto text-blue-600 text-sm hover:underline">Enable</button>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-red-50 rounded-xl p-4">
            <p className="text-xs text-red-500 font-semibold uppercase">Overdue Invoices</p>
            <p className="text-2xl font-bold text-red-900 mt-1">{[...new Set(allOverdue.map(r => r.inv.id))].length}</p>
          </div>
          <div className="bg-orange-50 rounded-xl p-4">
            <p className="text-xs text-orange-500 font-semibold uppercase">Pending Reminders</p>
            <p className="text-2xl font-bold text-orange-900 mt-1">{[...new Set(unsent.map(r => r.inv.id))].length}</p>
          </div>
          <div className="bg-yellow-50 rounded-xl p-4">
            <p className="text-xs text-yellow-600 font-semibold uppercase">Total Outstanding</p>
            <p className="text-2xl font-bold text-yellow-900 mt-1">{formatCurrency(totalOutstanding)}</p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {[['pending', `Pending (${[...new Set(unsent.map(r => r.inv.id))].length})`], ['all', `All Overdue (${[...new Set(allOverdue.map(r => r.inv.id))].length})`]].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === v ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {l}
            </button>
          ))}
        </div>

        {/* Reminders Table */}
        <Card padding={false}>
          {rows.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <p className="text-4xl mb-3">🎉</p>
              <p className="font-semibold text-gray-600">
                {filter === 'pending' ? 'No pending reminders!' : 'No overdue invoices'}
              </p>
              <p className="text-sm mt-1">
                {filter === 'pending' ? 'All overdue invoices have been reminded.' : 'All invoices are paid or not yet due.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3 text-left">Invoice</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Due Date</th>
                  <th className="px-4 py-3 text-center">Days Overdue</th>
                  <th className="px-4 py-3 text-right">Balance Due</th>
                  <th className="px-4 py-3 text-left">Last Reminded</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const customer = getCustomer(r.inv.customerId);
                  const balance = (r.inv.grandTotal || 0) - (r.inv.amountPaid || 0);
                  const lastSentEntry = r.logEntry || null;
                  return (
                    <tr key={r.inv.id} className={`border-b hover:bg-gray-50 ${r.daysPastDue >= 7 ? 'bg-red-50/30' : r.daysPastDue >= 3 ? 'bg-orange-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <Link to={`/sales/${r.inv.id}`} className="font-mono text-blue-600 hover:underline text-sm font-medium">
                          {r.inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{r.inv.customerName}</p>
                        {customer?.phone && <p className="text-xs text-gray-400">{customer.phone}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(r.inv.dueDate)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                          r.daysPastDue >= 7 ? 'bg-red-100 text-red-700' :
                          r.daysPastDue >= 3 ? 'bg-orange-100 text-orange-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {r.daysPastDue === 0 ? 'Today' : `${r.daysPastDue}d`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-red-700">{formatCurrency(balance)}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {lastSentEntry ? formatDate(lastSentEntry.sentAt.slice(0, 10)) : <span className="text-orange-400 font-medium">Not sent yet</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => sendOne(r)}>📱 Remind</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <p className="text-xs text-gray-400 text-center">
          Reminders open WhatsApp with a pre-filled message. Each reminder is logged to avoid duplicates per schedule interval.
        </p>
      </div>
    </>
  );
}
