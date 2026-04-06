import { createContext, useContext } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { generateId, now } from '../utils/helpers';

const Ctx = createContext();

export function CustomerProvider({ children }) {
  const [customers, setCustomers] = useLocalStorage('bms_customers', []);
  const add = (data) => setCustomers(p => [...p, { ...data, id: generateId('cust'), balance: 0, createdAt: now(), updatedAt: now() }]);
  const update = (id, data) => setCustomers(p => p.map(x => x.id === id ? { ...x, ...data, updatedAt: now() } : x));
  const remove = (id) => setCustomers(p => p.map(x => x.id === id ? { ...x, isActive: false, updatedAt: now() } : x));
  const get = (id) => customers.find(c => c.id === id);
  const updateBalance = (id, delta) => setCustomers(p => p.map(x => x.id === id ? { ...x, balance: (x.balance || 0) + delta, updatedAt: now() } : x));
  const active = customers.filter(c => c.isActive !== false);
  return <Ctx.Provider value={{ customers, active, add, update, remove, get, updateBalance }}>{children}</Ctx.Provider>;
}

export const useCustomers = () => useContext(Ctx);
