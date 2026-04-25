import { useState } from 'react';
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
    <div className="bg-orange-500 text-white px-4 py-3 flex items-center justify-between gap-4 flex-wrap text-sm">
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { settings } = useSettings();

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-black">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 lg:ml-60 overflow-y-auto flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 text-white sticky top-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md hover:bg-gray-700 transition-colors"
            aria-label="Open menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-semibold text-sm truncate">{settings.company?.name || 'BillingPro'}</span>
        </div>

        <ReminderBanner />
        <div className="p-4 lg:p-6 flex-1 dark:text-gray-100">{children}</div>
      </main>
    </div>
  );
}
