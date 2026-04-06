import { createContext, useContext, useState, useEffect } from 'react';
import { api, isApiAvailable, checkApiAvailable } from '../hooks/useApi';
import { useAuth } from './AuthContext';

const Ctx = createContext();
const LS = 'bms_customers';
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } };
const lsSave = (d) => localStorage.setItem(LS, JSON.stringify(d));

export function CustomerProvider({ children }) {
  const { currentUser } = useAuth();
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    if (!currentUser) return;
    checkApiAvailable().then(available => {
      if (!available) { setCustomers(lsGet()); return; }
      api('/customers').then(setCustomers).catch(console.error);
    });
  }, [currentUser]);

  const add = async (data) => {
    if (!isApiAvailable()) {
      const all = lsGet();
      const created = { ...data, id: 'c_' + Date.now(), balance: 0, isActive: true };
      lsSave([...all, created]);
      setCustomers(p => [...p, created]);
      return created;
    }
    const created = await api('/customers', { method: 'POST', body: data });
    setCustomers(p => [...p, created]);
    return created;
  };

  const update = async (id, data) => {
    if (!isApiAvailable()) {
      const all = lsGet().map(x => x.id === id ? { ...x, ...data } : x);
      lsSave(all);
      setCustomers(all);
      return all.find(x => x.id === id);
    }
    const updated = await api(`/customers/${id}`, { method: 'PUT', body: data });
    setCustomers(p => p.map(x => x.id === id ? updated : x));
    return updated;
  };

  const remove = async (id) => {
    if (!isApiAvailable()) {
      const all = lsGet().filter(x => x.id !== id);
      lsSave(all);
      setCustomers(all);
      return;
    }
    await api(`/customers/${id}`, { method: 'DELETE' });
    setCustomers(p => p.filter(x => x.id !== id));
  };

  const get = (id) => customers.find(c => c.id === id);

  const updateBalance = (id, delta) => {
    // Optimistic local update; authoritative balance comes from ledger
    setCustomers(p => p.map(x => x.id === id ? { ...x, balance: (Number(x.balance) || 0) + delta } : x));
  };

  const active = customers.filter(c => c.isActive !== false);

  return (
    <Ctx.Provider value={{ customers, active, add, update, remove, get, updateBalance }}>
      {children}
    </Ctx.Provider>
  );
}

export const useCustomers = () => useContext(Ctx);
