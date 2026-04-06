import { createContext, useContext, useState, useEffect } from 'react';
import { api, isApiAvailable } from '../hooks/useApi';
import { useAuth } from './AuthContext';

const Ctx = createContext();
const LS = 'bms_suppliers';
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } };
const lsSave = (d) => localStorage.setItem(LS, JSON.stringify(d));

export function SupplierProvider({ children }) {
  const { currentUser } = useAuth();
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    if (!currentUser) return;
    if (!isApiAvailable()) { setSuppliers(lsGet()); return; }
    api('/suppliers').then(setSuppliers).catch(console.error);
  }, [currentUser]);

  const add = async (data) => {
    if (!isApiAvailable()) {
      const all = lsGet();
      const created = { ...data, id: 's_' + Date.now(), balance: 0, isActive: true };
      lsSave([...all, created]);
      setSuppliers(p => [...p, created]);
      return created;
    }
    const created = await api('/suppliers', { method: 'POST', body: data });
    setSuppliers(p => [...p, created]);
    return created;
  };

  const update = async (id, data) => {
    if (!isApiAvailable()) {
      const all = lsGet().map(x => x.id === id ? { ...x, ...data } : x);
      lsSave(all);
      setSuppliers(all);
      return all.find(x => x.id === id);
    }
    const updated = await api(`/suppliers/${id}`, { method: 'PUT', body: data });
    setSuppliers(p => p.map(x => x.id === id ? updated : x));
    return updated;
  };

  const remove = async (id) => {
    if (!isApiAvailable()) {
      const all = lsGet().filter(x => x.id !== id);
      lsSave(all);
      setSuppliers(all);
      return;
    }
    await api(`/suppliers/${id}`, { method: 'DELETE' });
    setSuppliers(p => p.filter(x => x.id !== id));
  };

  const get = (id) => suppliers.find(s => s.id === id);

  const updateBalance = (id, delta) => {
    setSuppliers(p => p.map(x => x.id === id ? { ...x, balance: (Number(x.balance) || 0) + delta } : x));
  };

  const active = suppliers.filter(s => s.isActive !== false);

  return (
    <Ctx.Provider value={{ suppliers, active, add, update, remove, get, updateBalance }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSuppliers = () => useContext(Ctx);
