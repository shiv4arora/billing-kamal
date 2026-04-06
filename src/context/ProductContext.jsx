import { createContext, useContext } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { generateId, now } from '../utils/helpers';

const Ctx = createContext();

export function ProductProvider({ children }) {
  const [products, setProducts] = useLocalStorage('bms_products', []);

  const add = (data) => {
    const newProduct = { ...data, id: generateId('prod'), createdAt: now(), updatedAt: now() };
    setProducts(p => [...p, newProduct]);
    return newProduct;
  };
  const update = (id, data) => setProducts(p => p.map(x => x.id === id ? { ...x, ...data, updatedAt: now() } : x));
  const remove = (id) => setProducts(p => p.map(x => x.id === id ? { ...x, isActive: false, updatedAt: now() } : x));
  const get = (id) => products.find(p => p.id === id);
  const updateStock = (id, delta) => setProducts(p => p.map(x => x.id === id ? { ...x, currentStock: (x.currentStock || 0) + delta, updatedAt: now() } : x));
  const active = products.filter(p => p.isActive !== false);

  return <Ctx.Provider value={{ products, active, add, update, remove, get, updateStock }}>{children}</Ctx.Provider>;
}

export const useProducts = () => useContext(Ctx);
