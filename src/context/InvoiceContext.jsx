import { createContext, useContext } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { generateId, now } from '../utils/helpers';

const Ctx = createContext();

export function InvoiceProvider({ children }) {
  const [saleInvoices, setSaleInvoices] = useLocalStorage('bms_sale_invoices', []);
  const [purchaseInvoices, setPurchaseInvoices] = useLocalStorage('bms_purchase_invoices', []);
  const [stockLedger, setStockLedger] = useLocalStorage('bms_stock_ledger', []);

  const addSaleInvoice = (data) => {
    const inv = { ...data, id: generateId('sinv'), createdAt: now(), updatedAt: now() };
    setSaleInvoices(p => [...p, inv]);
    return inv;
  };
  const updateSaleInvoice = (id, data) => setSaleInvoices(p => p.map(x => x.id === id ? { ...x, ...data, updatedAt: now() } : x));
  const getSaleInvoice = (id) => saleInvoices.find(i => i.id === id);

  const addPurchaseInvoice = (data) => {
    const inv = { ...data, id: generateId('pinv'), createdAt: now(), updatedAt: now() };
    setPurchaseInvoices(p => [...p, inv]);
    return inv;
  };
  const updatePurchaseInvoice = (id, data) => setPurchaseInvoices(p => p.map(x => x.id === id ? { ...x, ...data, updatedAt: now() } : x));
  const getPurchaseInvoice = (id) => purchaseInvoices.find(i => i.id === id);

  const addStockEntry = (entry) => setStockLedger(p => [...p, { ...entry, id: generateId('sl'), createdAt: now() }]);

  return (
    <Ctx.Provider value={{ saleInvoices, addSaleInvoice, updateSaleInvoice, getSaleInvoice, purchaseInvoices, addPurchaseInvoice, updatePurchaseInvoice, getPurchaseInvoice, stockLedger, addStockEntry }}>
      {children}
    </Ctx.Provider>
  );
}

export const useInvoices = () => useContext(Ctx);
