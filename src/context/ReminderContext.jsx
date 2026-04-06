import { createContext, useContext, useMemo } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { now, today } from '../utils/helpers';

const Ctx = createContext();

/**
 * Reminder log key: `${invoiceId}_d${dayOffset}`
 * Log entry: { sentAt, invoiceId, dayOffset, customerName, invoiceNumber }
 */
export function ReminderProvider({ children }) {
  const [log, setLog] = useLocalStorage('bms_reminder_log', {});

  const logReminderSent = (invoiceId, dayOffset, meta = {}) => {
    const key = `${invoiceId}_d${dayOffset}`;
    setLog(prev => ({ ...prev, [key]: { sentAt: now(), invoiceId, dayOffset, ...meta } }));
  };

  const getReminderEntry = (invoiceId, dayOffset) =>
    log[`${invoiceId}_d${dayOffset}`] || null;

  const clearInvoiceLogs = (invoiceId) => {
    setLog(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.startsWith(`${invoiceId}_`)) delete next[k]; });
      return next;
    });
  };

  return (
    <Ctx.Provider value={{ log, logReminderSent, getReminderEntry, clearInvoiceLogs }}>
      {children}
    </Ctx.Provider>
  );
}

export const useReminderLog = () => useContext(Ctx);

/**
 * Compute pending reminders given invoices + settings + log.
 * Returns array of { inv, offset, daysPastDue, logEntry }
 */
export function computePendingReminders(saleInvoices, reminderSettings, getReminderEntry) {
  if (!reminderSettings?.enabled) return [];
  const schedule = reminderSettings.schedule || [0, 3, 7];
  const todayStr = today();

  const pending = [];
  saleInvoices.forEach(inv => {
    if (inv.status === 'void' || inv.status === 'draft') return;
    if (inv.paymentStatus === 'paid') return;
    const balance = (inv.grandTotal || 0) - (inv.amountPaid || 0);
    if (balance <= 0.01) return;
    if (!inv.dueDate || inv.dueDate > todayStr) return;

    const dueMs = new Date(inv.dueDate).getTime();
    const todayMs = new Date(todayStr).getTime();
    const daysPastDue = Math.max(0, Math.floor((todayMs - dueMs) / 86400000));

    schedule.forEach(offset => {
      if (daysPastDue < offset) return; // trigger not reached yet
      const logEntry = getReminderEntry(inv.id, offset);
      pending.push({ inv, offset, daysPastDue, logEntry, sent: !!logEntry });
    });
  });

  return pending;
}
