import { createContext, useContext } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

const Ctx = createContext();

const DEFAULT = {
  company: { name: 'My Trading Co.', address: '', phone: '', email: '', gstin: '', state: 'Maharashtra', stateCode: '27', logo: null },
  invoice: { salePrefix: 'SI', purchasePrefix: 'PI', nextSaleNo: 1, nextPurchaseNo: 1, defaultDueDays: 14, showHSN: true, bankDetails: '', terms: 'Goods once sold will not be returned.' },
  tax: { defaultGSTRate: 5, intraState: true },
  lowStockThreshold: 10,
  nextSkuNo: 1001,   // global sequential product code — vendor-independent
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useLocalStorage('bms_settings', DEFAULT);

  const update = (path, value) => {
    setSettings(prev => {
      const next = { ...prev };
      const parts = path.split('.');
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) { obj[parts[i]] = { ...obj[parts[i]] }; obj = obj[parts[i]]; }
      obj[parts[parts.length - 1]] = value;
      return next;
    });
  };

  const bumpSaleNo     = () => { const n = settings.invoice.nextSaleNo;     setSettings(p => ({ ...p, invoice: { ...p.invoice, nextSaleNo:     n + 1 } })); return n; };
  const bumpPurchaseNo = () => { const n = settings.invoice.nextPurchaseNo; setSettings(p => ({ ...p, invoice: { ...p.invoice, nextPurchaseNo: n + 1 } })); return n; };

  /** Returns next SKU number (as string) and advances the counter by `count` */
  const bumpSkuNo = (count = 1) => {
    const n = settings.nextSkuNo || 1001;
    setSettings(p => ({ ...p, nextSkuNo: n + count }));
    return n;   // caller gets the first assigned number
  };

  return (
    <Ctx.Provider value={{ settings, update, bumpSaleNo, bumpPurchaseNo, bumpSkuNo }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSettings = () => useContext(Ctx);
