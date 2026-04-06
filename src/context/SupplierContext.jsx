import { createContext, useContext } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { generateId, now } from '../utils/helpers';

const Ctx = createContext();

export function SupplierProvider({ children }) {
  const [suppliers, setSuppliers] = useLocalStorage('bms_suppliers', []);
  const add = (data) => setSuppliers(p => [...p, { ...data, id: generateId('supp'), balance: 0, createdAt: now(), updatedAt: now() }]);
  const update = (id, data) => setSuppliers(p => p.map(x => x.id === id ? { ...x, ...data, updatedAt: now() } : x));
  const remove = (id) => setSuppliers(p => p.map(x => x.id === id ? { ...x, isActive: false, updatedAt: now() } : x));
  const get = (id) => suppliers.find(s => s.id === id);
  const updateBalance = (id, delta) => setSuppliers(p => p.map(x => x.id === id ? { ...x, balance: (x.balance || 0) + delta, updatedAt: now() } : x));
  const active = suppliers.filter(s => s.isActive !== false);
  return <Ctx.Provider value={{ suppliers, active, add, update, remove, get, updateBalance }}>{children}</Ctx.Provider>;
}

export const useSuppliers = () => useContext(Ctx);
