import { createContext, useContext, useState, useEffect } from 'react';
import { api, isApiAvailable } from '../hooks/useApi';
import { useAuth } from './AuthContext';

const Ctx = createContext();
const LS = 'bms_products';
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } };
const lsSave = (d) => localStorage.setItem(LS, JSON.stringify(d));

export function ProductProvider({ children }) {
  const { currentUser } = useAuth();
  const [products, setProducts] = useState([]);

  useEffect(() => {
    if (!currentUser) return;
    if (!isApiAvailable()) { setProducts(lsGet()); return; }
    api('/products').then(setProducts).catch(console.error);
  }, [currentUser]);

  const add = async (data) => {
    if (!isApiAvailable()) {
      const all = lsGet();
      const created = { ...data, id: 'p_' + Date.now(), isActive: true };
      lsSave([...all, created]);
      setProducts(p => [...p, created]);
      return created;
    }
    const created = await api('/products', { method: 'POST', body: data });
    setProducts(p => [...p, created]);
    return created;
  };

  const update = async (id, data) => {
    if (!isApiAvailable()) {
      const all = lsGet().map(x => x.id === id ? { ...x, ...data } : x);
      lsSave(all);
      setProducts(all);
      return all.find(x => x.id === id);
    }
    const updated = await api(`/products/${id}`, { method: 'PUT', body: data });
    setProducts(p => p.map(x => x.id === id ? updated : x));
    return updated;
  };

  const remove = async (id) => {
    if (!isApiAvailable()) {
      const all = lsGet().filter(x => x.id !== id);
      lsSave(all);
      setProducts(all);
      return;
    }
    await api(`/products/${id}`, { method: 'DELETE' });
    setProducts(p => p.filter(x => x.id !== id));
  };

  const get = (id) => products.find(p => p.id === id);

  const updateStock = async (id, delta) => {
    setProducts(p => p.map(x => x.id === id ? { ...x, currentStock: (Number(x.currentStock) || 0) + delta } : x));
    if (!isApiAvailable()) {
      const all = lsGet().map(x => x.id === id ? { ...x, currentStock: (Number(x.currentStock) || 0) + delta } : x);
      lsSave(all);
    }
  };

  /** Set stock to an exact value (used after API response) */
  const updateStockLocal = (id, newStock) => {
    setProducts(p => p.map(x => x.id === id ? { ...x, currentStock: newStock } : x));
  };

  const active = products.filter(p => p.isActive !== false);

  return (
    <Ctx.Provider value={{ products, active, add, update, remove, get, updateStock, updateStockLocal }}>
      {children}
    </Ctx.Provider>
  );
}

export const useProducts = () => useContext(Ctx);
