import { createContext, useContext, useState, useEffect } from 'react';
import { api, isApiAvailable, checkApiAvailable } from '../hooks/useApi';
import { useAuth } from './AuthContext';
import { buildInvoiceTotals, nextInvoiceNumber } from '../utils/helpers';

const LS_SALES = 'bms_sale_invoices';
const LS_PURCH = 'bms_purchase_invoices';
const LS_STOCK = 'bms_stock_ledger';
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const lsSave = (k, d) => localStorage.setItem(k, JSON.stringify(d));

const Ctx = createContext();

export function InvoiceProvider({ children }) {
  const { currentUser } = useAuth();
  const [saleInvoices, setSaleInvoices] = useState([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState([]);
  const [stockLedger, setStockLedger] = useState([]);

  useEffect(() => {
    if (!currentUser) return;
    checkApiAvailable().then(available => {
      if (!available) {
        setSaleInvoices(lsGet(LS_SALES));
        setPurchaseInvoices(lsGet(LS_PURCH));
        setStockLedger(lsGet(LS_STOCK));
        return;
      }
      api('/sales').then(setSaleInvoices).catch(console.error);
      api('/purchases').then(setPurchaseInvoices).catch(console.error);
    });
  }, [currentUser]);

  // ── SALE INVOICES ──────────────────────────────────────────────────────────

  const addSaleInvoice = async (data) => {
    if (!isApiAvailable()) {
      const all = lsGet(LS_SALES);
      const inv = { ...data, id: 'si_' + Date.now(), createdAt: new Date().toISOString() };
      lsSave(LS_SALES, [inv, ...all]);
      setSaleInvoices(p => [inv, ...p]);
      return inv;
    }
    const inv = await api('/sales', { method: 'POST', body: data });
    setSaleInvoices(p => [inv, ...p]);
    return inv;
  };

  const issueSaleInvoice = async (id) => {
    if (!isApiAvailable()) {
      // Offline: assign invoice number and update locally
      const all = lsGet(LS_SALES);
      const settings = JSON.parse(localStorage.getItem('bms_settings') || '{}');
      const prefix = settings?.invoice?.salePrefix || 'SI';
      const nextNo = settings?.invoice?.nextSaleNo || 1;
      const invoiceNumber = nextInvoiceNumber(prefix, nextNo);
      if (settings?.invoice) { settings.invoice.nextSaleNo = nextNo + 1; localStorage.setItem('bms_settings', JSON.stringify(settings)); }
      const totals = buildInvoiceTotals(all.find(x => x.id === id)?.items || [], settings?.tax?.intraState !== false);
      const inv = { ...all.find(x => x.id === id), ...totals, invoiceNumber, status: 'issued' };
      const updated = all.map(x => x.id === id ? inv : x);
      lsSave(LS_SALES, updated);
      setSaleInvoices(updated);
      return inv;
    }
    const inv = await api(`/sales/${id}/issue`, { method: 'POST' });
    setSaleInvoices(p => p.map(x => x.id === id ? inv : x));
    return inv;
  };

  const updateSaleInvoice = async (id, data) => {
    if (!isApiAvailable()) {
      const all = lsGet(LS_SALES).map(x => x.id === id ? { ...x, ...data } : x);
      lsSave(LS_SALES, all);
      setSaleInvoices(all);
      return all.find(x => x.id === id);
    }
    const inv = await api(`/sales/${id}`, { method: 'PUT', body: data });
    setSaleInvoices(p => p.map(x => x.id === id ? inv : x));
    return inv;
  };

  const getSaleInvoice = (id) => saleInvoices.find(i => i.id === id);

  /** Update local cache only — used after dedicated action API calls (payment, void, return) */
  const updateSaleInvoiceLocal = (id, data) => setSaleInvoices(p => p.map(x => x.id === id ? { ...x, ...data } : x));

  const deleteSaleInvoice = async (id) => {
    if (!isApiAvailable()) {
      const all = lsGet(LS_SALES).filter(x => x.id !== id);
      lsSave(LS_SALES, all);
      setSaleInvoices(all);
      return;
    }
    await api(`/sales/${id}`, { method: 'DELETE' });
    setSaleInvoices(p => p.filter(x => x.id !== id));
  };

  // ── PURCHASE INVOICES ──────────────────────────────────────────────────────

  const addPurchaseInvoice = async (data) => {
    if (!isApiAvailable()) {
      const all = lsGet(LS_PURCH);
      const inv = { ...data, id: 'pi_' + Date.now(), createdAt: new Date().toISOString() };
      lsSave(LS_PURCH, [inv, ...all]);
      setPurchaseInvoices(p => [inv, ...p]);
      return inv;
    }
    const inv = await api('/purchases', { method: 'POST', body: data });
    setPurchaseInvoices(p => [inv, ...p]);
    return inv;
  };

  const issuePurchaseInvoice = async (id) => {
    if (!isApiAvailable()) {
      const all = lsGet(LS_PURCH);
      const settings = JSON.parse(localStorage.getItem('bms_settings') || '{}');
      const prefix = settings?.invoice?.purchasePrefix || 'PI';
      const nextNo = settings?.invoice?.nextPurchaseNo || 1;
      const invoiceNumber = nextInvoiceNumber(prefix, nextNo);
      if (settings?.invoice) { settings.invoice.nextPurchaseNo = nextNo + 1; localStorage.setItem('bms_settings', JSON.stringify(settings)); }
      const inv = { ...all.find(x => x.id === id), invoiceNumber, status: 'issued' };
      const updated = all.map(x => x.id === id ? inv : x);
      lsSave(LS_PURCH, updated);
      setPurchaseInvoices(updated);
      return inv;
    }
    const inv = await api(`/purchases/${id}/issue`, { method: 'POST' });
    setPurchaseInvoices(p => p.map(x => x.id === id ? inv : x));
    return inv;
  };

  const updatePurchaseInvoice = async (id, data) => {
    if (!isApiAvailable()) {
      const all = lsGet(LS_PURCH).map(x => x.id === id ? { ...x, ...data } : x);
      lsSave(LS_PURCH, all);
      setPurchaseInvoices(all);
      return all.find(x => x.id === id);
    }
    const inv = await api(`/purchases/${id}`, { method: 'PUT', body: data });
    setPurchaseInvoices(p => p.map(x => x.id === id ? inv : x));
    return inv;
  };

  const getPurchaseInvoice = (id) => purchaseInvoices.find(i => i.id === id);

  /** Update local cache only — used after dedicated action API calls */
  const updatePurchaseInvoiceLocal = (id, data) => setPurchaseInvoices(p => p.map(x => x.id === id ? { ...x, ...data } : x));

  const deletePurchaseInvoice = async (id) => {
    if (!isApiAvailable()) {
      const all = lsGet(LS_PURCH).filter(x => x.id !== id);
      lsSave(LS_PURCH, all);
      setPurchaseInvoices(all);
      return;
    }
    await api(`/purchases/${id}`, { method: 'DELETE' });
    setPurchaseInvoices(p => p.filter(x => x.id !== id));
  };

  // Stock ledger
  const addStockEntry = async (entry) => {
    if (!isApiAvailable()) {
      const all = lsGet(LS_STOCK);
      const newEntry = { ...entry, id: 'sl_' + Date.now() };
      lsSave(LS_STOCK, [newEntry, ...all]);
      setStockLedger(p => [newEntry, ...p]);
      return;
    }
    // server-side during issue
  };

  return (
    <Ctx.Provider value={{
      saleInvoices, addSaleInvoice, issueSaleInvoice, updateSaleInvoice, getSaleInvoice, updateSaleInvoiceLocal, deleteSaleInvoice,
      purchaseInvoices, addPurchaseInvoice, issuePurchaseInvoice, updatePurchaseInvoice, getPurchaseInvoice, updatePurchaseInvoiceLocal, deletePurchaseInvoice,
      stockLedger, addStockEntry,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useInvoices = () => useContext(Ctx);
