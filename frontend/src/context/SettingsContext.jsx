import { createContext, useContext, useState, useEffect } from 'react';
import { api, isApiAvailable } from '../hooks/useApi';
import { useAuth } from './AuthContext';

const Ctx = createContext();

const DEFAULT = {
  company: { name: 'My Trading Co.', address: '', phone: '', email: '', gstin: '', state: 'Maharashtra', stateCode: '27', logo: null },
  invoice: { salePrefix: 'SI', purchasePrefix: 'PI', defaultDueDays: 14, showHSN: true, bankDetails: '', terms: 'Goods once sold will not be returned.' },
  tax: { defaultGSTRate: 0, intraState: true },
  lowStockThreshold: 10,
  reminders: { enabled: true, schedule: [0, 3, 7], messageTemplate: '' },
};

export function SettingsProvider({ children }) {
  const { currentUser } = useAuth();
  const [settings, setSettings] = useState(DEFAULT);

  useEffect(() => {
    if (!currentUser) return;
    if (!isApiAvailable()) {
      try { const s = JSON.parse(localStorage.getItem('bms_settings') || 'null'); if (s) setSettings(prev => ({ ...prev, ...s })); } catch {}
      return;
    }
    api('/settings').then(data => setSettings(s => ({ ...s, ...data }))).catch(console.error);
  }, [currentUser]);

  const update = async (path, value) => {
    // Optimistic local update
    setSettings(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const parts = path.split('.');
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) { obj[parts[i]] = obj[parts[i]] || {}; obj = obj[parts[i]]; }
      obj[parts[parts.length - 1]] = value;
      if (!isApiAvailable()) localStorage.setItem('bms_settings', JSON.stringify(next));
      return next;
    });
    if (!isApiAvailable()) return;
    await api('/settings', { method: 'PUT', body: { path, value } }).catch(console.error);
  };

  // Counter bumping is now server-side — these return local values as hints only
  // The actual assigned number comes back in the API response
  const bumpSaleNo = () => settings.invoice?.nextSaleNo || 1;
  const bumpPurchaseNo = () => settings.invoice?.nextPurchaseNo || 1;
  const bumpSkuNo = (count = 1) => settings.nextSkuNo || 1001;

  return (
    <Ctx.Provider value={{ settings, update, bumpSaleNo, bumpPurchaseNo, bumpSkuNo }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSettings = () => useContext(Ctx);
