import { createContext, useContext } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { generateId, now } from '../utils/helpers';

const Ctx = createContext();

/**
 * Ledger entry shape:
 * { id, partyType, partyId, partyName, date, type, debit, credit,
 *   referenceType, referenceId, referenceNo, narration, createdAt }
 *
 * Customer ledger: debit = they owe us (sale), credit = they paid / return
 * Supplier ledger: credit = we owe them (purchase), debit = we paid / return
 * Running balance (customer) = cumulative(debit - credit)  → positive = Dr = receivable
 * Running balance (supplier) = cumulative(credit - debit)  → positive = Cr = payable
 */
export function LedgerProvider({ children }) {
  const [entries, setEntries] = useLocalStorage('bms_ledger', []);

  const addEntry = (entry) => {
    const e = { ...entry, id: generateId('led'), createdAt: now() };
    setEntries(p => [...p, e]);
    return e;
  };

  /* ── Customer ──────────────────────────────────── */
  const addSaleEntry = ({ customerId, customerName, date, invoiceId, invoiceNo, amount }) =>
    addEntry({ partyType: 'customer', partyId: customerId, partyName: customerName,
      date, type: 'sale_invoice', debit: amount, credit: 0,
      referenceType: 'sale_invoice', referenceId: invoiceId, referenceNo: invoiceNo,
      narration: `Sale Invoice ${invoiceNo}` });

  const addPaymentIn = ({ customerId, customerName, date, amount, method, referenceId, referenceNo, narration }) =>
    addEntry({ partyType: 'customer', partyId: customerId, partyName: customerName,
      date, type: 'payment_in', debit: 0, credit: amount,
      referenceType: 'payment', referenceId: referenceId || generateId('pay'), referenceNo: referenceNo || '',
      narration: narration || `Payment received (${method || 'cash'})` });

  const addSaleReturn = ({ customerId, customerName, date, amount, referenceId, referenceNo, narration }) =>
    addEntry({ partyType: 'customer', partyId: customerId, partyName: customerName,
      date, type: 'sale_return', debit: 0, credit: amount,
      referenceType: 'sale_return', referenceId: referenceId || generateId('sr'), referenceNo: referenceNo || '',
      narration: narration || `Sale Return${referenceNo ? ` - ${referenceNo}` : ''}` });

  /* ── Supplier ──────────────────────────────────── */
  const addPurchaseEntry = ({ supplierId, supplierName, date, invoiceId, invoiceNo, amount }) =>
    addEntry({ partyType: 'supplier', partyId: supplierId, partyName: supplierName,
      date, type: 'purchase_invoice', debit: 0, credit: amount,
      referenceType: 'purchase_invoice', referenceId: invoiceId, referenceNo: invoiceNo,
      narration: `Purchase Invoice ${invoiceNo}` });

  const addPaymentOut = ({ supplierId, supplierName, date, amount, method, referenceId, referenceNo, narration }) =>
    addEntry({ partyType: 'supplier', partyId: supplierId, partyName: supplierName,
      date, type: 'payment_out', debit: amount, credit: 0,
      referenceType: 'payment', referenceId: referenceId || generateId('pay'), referenceNo: referenceNo || '',
      narration: narration || `Payment made (${method || 'cash'})` });

  const addPurchaseReturn = ({ supplierId, supplierName, date, amount, referenceId, referenceNo, narration }) =>
    addEntry({ partyType: 'supplier', partyId: supplierId, partyName: supplierName,
      date, type: 'purchase_return', debit: amount, credit: 0,
      referenceType: 'purchase_return', referenceId: referenceId || generateId('pr'), referenceNo: referenceNo || '',
      narration: narration || `Purchase Return${referenceNo ? ` - ${referenceNo}` : ''}` });

  /* ── Manual adjustment ─────────────────────────── */
  const addAdjustment = ({ partyType, partyId, partyName, date, debit, credit, narration }) =>
    addEntry({ partyType, partyId, partyName, date, type: 'adjustment', debit: debit || 0, credit: credit || 0,
      referenceType: 'adjustment', referenceId: generateId('adj'), referenceNo: '',
      narration: narration || 'Manual Adjustment' });

  /* ── Queries ───────────────────────────────────── */
  const getEntriesByParty = (partyType, partyId) =>
    entries
      .filter(e => e.partyType === partyType && e.partyId === partyId)
      .sort((a, b) => {
        const d = new Date(a.date) - new Date(b.date);
        return d !== 0 ? d : new Date(a.createdAt) - new Date(b.createdAt);
      });

  const getBalance = (partyType, partyId) => {
    const list = getEntriesByParty(partyType, partyId);
    const dr = list.reduce((s, e) => s + (e.debit || 0), 0);
    const cr = list.reduce((s, e) => s + (e.credit || 0), 0);
    return partyType === 'customer' ? dr - cr : cr - dr;
  };

  return (
    <Ctx.Provider value={{
      entries,
      addSaleEntry, addPaymentIn, addSaleReturn,
      addPurchaseEntry, addPaymentOut, addPurchaseReturn,
      addAdjustment,
      getEntriesByParty, getBalance,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useLedger = () => useContext(Ctx);
