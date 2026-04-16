import { createContext, useContext } from 'react';
import { api, isApiAvailable } from '../hooks/useApi';

const LS = 'bms_ledger_entries';
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } };
const lsSave = (d) => localStorage.setItem(LS, JSON.stringify(d));
const lsAdd = (entry) => { const all = lsGet(); const e = { ...entry, id: 'le_' + Date.now(), createdAt: new Date().toISOString() }; lsSave([e, ...all]); return e; };

const Ctx = createContext();

export function LedgerProvider({ children }) {

  const getEntriesByParty = async (partyType, partyId) => {
    if (!isApiAvailable()) {
      return lsGet().filter(e => e.partyType === partyType && e.partyId === partyId)
        .sort((a, b) => a.date > b.date ? 1 : -1);
    }
    const data = await api(`/ledger/${partyType}/${partyId}`);
    return data.entries || [];
  };

  const getBalance = async (partyType, partyId) => {
    if (!isApiAvailable()) {
      const entries = lsGet().filter(e => e.partyType === partyType && e.partyId === partyId);
      return entries.reduce((s, e) => s + (e.debit || 0) - (e.credit || 0), 0);
    }
    const data = await api(`/ledger/${partyType}/${partyId}`);
    return data.balance || 0;
  };

  // Customer ledger entries
  const addSaleEntry = async (opts) => {
    // Called from SaleInvoiceCreate — now a no-op since server handles this during issue
  };
  const addPaymentIn = async (opts) => {
    if (!isApiAvailable()) {
      lsAdd({ partyType: 'customer', partyId: opts.customerId, partyName: opts.customerName, date: opts.date, type: 'payment_in', debit: 0, credit: opts.amount, narration: opts.narration });
      return;
    }
    if (opts.customerId && opts.amount > 0) {
      await api(`/ledger/customer/${opts.customerId}/payment`, {
        method: 'POST',
        body: { date: opts.date, amount: opts.amount, method: opts.method, narration: opts.narration },
      }).catch(console.error);
    }
  };
  const addSaleReturn = async (opts) => {
    if (!isApiAvailable()) {
      lsAdd({ partyType: 'customer', partyId: opts.customerId, partyName: opts.customerName, date: opts.date, type: 'sale_return', debit: 0, credit: opts.amount, narration: opts.narration });
      return;
    }
    if (opts.customerId) {
      await api(`/ledger/customer/${opts.customerId}/return`, {
        method: 'POST',
        body: { date: opts.date, amount: opts.amount, narration: opts.narration },
      }).catch(console.error);
    }
  };

  const addPurchaseEntry = async (opts) => {
    if (!isApiAvailable()) {
      lsAdd({ partyType: 'supplier', partyId: opts.supplierId, partyName: opts.supplierName, date: opts.date, type: 'purchase_invoice', debit: 0, credit: opts.amount, referenceNo: opts.invoiceNo, narration: `Purchase Invoice ${opts.invoiceNo}` });
    }
  };
  const addPaymentOut = async (opts) => {
    if (!isApiAvailable()) {
      lsAdd({ partyType: 'supplier', partyId: opts.supplierId, partyName: opts.supplierName, date: opts.date, type: 'payment_out', debit: opts.amount, credit: 0, narration: opts.narration });
      return;
    }
    if (opts.supplierId && opts.amount > 0) {
      await api(`/ledger/supplier/${opts.supplierId}/payment`, {
        method: 'POST',
        body: { date: opts.date, amount: opts.amount, method: opts.method, narration: opts.narration },
      }).catch(console.error);
    }
  };
  const addPurchaseReturn = async (opts) => {
    if (!isApiAvailable()) {
      lsAdd({ partyType: 'supplier', partyId: opts.supplierId, partyName: opts.supplierName, date: opts.date, type: 'purchase_return', debit: opts.amount, credit: 0, narration: opts.narration });
      return;
    }
    if (opts.supplierId) {
      await api(`/ledger/supplier/${opts.supplierId}/return`, {
        method: 'POST',
        body: { date: opts.date, amount: opts.amount, narration: opts.narration },
      }).catch(console.error);
    }
  };

  const addAdjustment = async (opts) => {
    if (!isApiAvailable()) {
      lsAdd({ partyType: opts.partyType, partyId: opts.partyId, partyName: opts.partyName, date: opts.date, type: 'adjustment', debit: opts.debit || 0, credit: opts.credit || 0, narration: opts.narration });
      return;
    }
    const route = opts.partyType === 'customer'
      ? `/ledger/customer/${opts.partyId}/adjustment`
      : `/ledger/supplier/${opts.partyId}/adjustment`;
    await api(route, {
      method: 'POST',
      body: { date: opts.date, debit: opts.debit, credit: opts.credit, narration: opts.narration },
    }).catch(console.error);
  };

  const editEntry = async (entryId, data) => {
    if (!isApiAvailable()) {
      // Offline: update local storage (simplified — no balance reversal in offline mode)
      const all = lsGet();
      lsSave(all.map(e => e.id === entryId ? { ...e, ...data } : e));
      return;
    }
    await api(`/ledger/entry/${entryId}`, { method: 'PUT', body: data });
  };

  const deleteEntry = async (entryId) => {
    if (!isApiAvailable()) {
      lsSave(lsGet().filter(e => e.id !== entryId));
      return;
    }
    await api(`/ledger/entry/${entryId}`, { method: 'DELETE' });
  };

  // Kept for components that still call these synchronously (will be async)
  const entries = [];

  return (
    <Ctx.Provider value={{
      entries,
      getEntriesByParty, getBalance,
      addSaleEntry, addPaymentIn, addSaleReturn,
      addPurchaseEntry, addPaymentOut, addPurchaseReturn,
      addAdjustment, editEntry, deleteEntry,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useLedger = () => useContext(Ctx);
