import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useReminderLog } from '../../context/ReminderContext';
import { useSettings } from '../../context/SettingsContext';
import { useCustomers } from '../../context/CustomerContext';
import { formatCurrency } from '../../utils/helpers';

function buildWhatsAppUrl(inv, customer, companyName, template) {
  const balance = (inv.grandTotal || 0) - (inv.amountPaid || 0);
  const phone = (customer?.phone || inv.phone || '').replace(/\D/g, '');
  const msg = (template ||
    'Dear {customer},\n\nThis is a reminder that invoice *{invoiceNo}* is overdue.\n\nBalance Due: *{balance}*\n\nKindly arrange payment at the earliest.\n\nRegards,\n{company}')
    .replace('{customer}', inv.customerName || customer?.name || '')
    .replace('{invoiceNo}', inv.invoiceNumber || '')
    .replace('{date}', inv.date || '')
    .replace('{amount}', formatCurrency(inv.grandTotal || 0))
    .replace('{balance}', formatCurrency(balance))
    .replace('{company}', companyName || 'Us');
  return phone
    ? `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

function ReminderBanner() {
  const { pendingCount, pendingReminders, alertDismissed, dismissAlert, logReminderSent } = useReminderLog();
  const { settings } = useSettings();
  const { get: getCustomer } = useCustomers();
  const navigate = useNavigate();

  if (!pendingCount || alertDismissed) return null;

  const reminderEnabled = settings.reminders?.enabled !== false;
  if (!reminderEnabled) return null;

  const handleSendAll = async () => {
    // Dedupe by invoice
    const seen = new Set();
    const toSend = pendingReminders.filter(r => {
      if (seen.has(r.inv.id)) return false;
      seen.add(r.inv.id);
      return true;
    });

    const template = settings.reminders?.messageTemplate || '';
    const companyName = settings.company?.name || '';

    for (let i = 0; i < toSend.length; i++) {
      const r = toSend[i];
      const customer = getCustomer(r.inv.customerId);
      const url = buildWhatsAppUrl(r.inv, customer, companyName, template);
      // Stagger tab opens slightly so browsers don't block them
      await new Promise(res => setTimeout(res, i * 400));
      window.open(url, '_blank');
      await logReminderSent(r.inv.id, r.offset, {
        customerName: r.inv.customerName,
        invoiceNumber: r.inv.invoiceNumber,
      });
    }
    dismissAlert();
  };

  return (
    <div className="bg-orange-500 text-white px-5 py-3 flex items-center justify-between gap-4 flex-wrap text-sm">
      <div className="flex items-center gap-2">
        <span className="text-lg">🔔</span>
        <span className="font-semibold">
          {pendingCount} overdue invoice{pendingCount > 1 ? 's' : ''} need{pendingCount === 1 ? 's' : ''} a payment reminder
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSendAll}
          className="bg-white text-orange-600 font-semibold px-4 py-1.5 rounded-lg hover:bg-orange-50 transition-colors text-sm"
        >
          📱 Send All via WhatsApp
        </button>
        <button
          onClick={() => navigate('/reminders')}
          className="text-white/80 hover:text-white underline text-sm"
        >
          View
        </button>
        <button
          onClick={dismissAlert}
          className="text-white/60 hover:text-white ml-2 text-lg leading-none"
          title="Dismiss for 4 hours"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export default function MainLayout({ children }) {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 ml-60 overflow-y-auto flex flex-col">
        <ReminderBanner />
        <div className="p-6 flex-1">{children}</div>
      </main>
    </div>
  );
}
