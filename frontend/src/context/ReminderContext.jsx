import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, isApiAvailable } from '../hooks/useApi';
import { useAuth } from './AuthContext';

const Ctx = createContext();

export function ReminderProvider({ children }) {
  const { currentUser } = useAuth();
  const [pendingReminders, setPendingReminders] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [alertDismissed, setAlertDismissed] = useState(false);

  const loadPending = useCallback(async () => {
    if (!currentUser) return;
    try {
      const list = await computePendingReminders();
      const unsent = list.filter(r => !r.sent);
      setPendingReminders(unsent);
      setPendingCount([...new Set(unsent.map(r => r.inv.id))].length);
    } catch {
      // silently ignore — user may not have API running
    }
  }, [currentUser]);

  // Load pending reminders when user logs in
  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const logReminderSent = async (invoiceId, dayOffset, meta = {}) => {
    if (!isApiAvailable()) return;
    await api('/reminders/log', {
      method: 'POST',
      body: { invoiceId, dayOffset, customerName: meta.customerName || '', invoiceNumber: meta.invoiceNumber || '' },
    }).catch(console.error);
    // Refresh count after logging
    loadPending();
  };

  const dismissAlert = () => {
    setAlertDismissed(true);
    // Re-show after 4 hours
    setTimeout(() => setAlertDismissed(false), 4 * 60 * 60 * 1000);
  };

  const getReminderEntry = async () => null;
  const clearInvoiceLogs = async () => {};

  return (
    <Ctx.Provider value={{
      log: {},
      pendingCount,
      pendingReminders,
      alertDismissed,
      logReminderSent,
      dismissAlert,
      loadPending,
      getReminderEntry,
      clearInvoiceLogs,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useReminderLog = () => useContext(Ctx);

// Used by Reminders.jsx and ReminderContext — fetches from API
export async function computePendingReminders() {
  try {
    return await api('/reminders/pending');
  } catch {
    return [];
  }
}
