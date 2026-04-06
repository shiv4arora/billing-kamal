import { createContext, useContext, useState } from 'react';
import { generateId, now } from '../utils/helpers';

const AuthCtx = createContext();

const SEED_ADMIN = {
  id: 'usr_admin',
  username: 'admin',
  password: 'admin123',
  name: 'Administrator',
  role: 'admin',
  isActive: true,
  createdAt: new Date().toISOString(),
};

export const ALL_PERMISSIONS = [
  { key: 'dashboard',        label: 'Dashboard',              group: 'Overview'  },
  { key: 'sales_view',       label: 'View Sale Invoices',     group: 'Sales'     },
  { key: 'sales_create',     label: 'Create Sale Invoice',    group: 'Sales'     },
  { key: 'purchases_view',   label: 'View Purchase Invoices', group: 'Purchases' },
  { key: 'purchases_create', label: 'Create Purchase Invoice',group: 'Purchases' },
  { key: 'customers_view',   label: 'View Customers',         group: 'Customers' },
  { key: 'customers_manage', label: 'Add / Edit Customers',   group: 'Customers' },
  { key: 'suppliers_view',   label: 'View Suppliers',         group: 'Suppliers' },
  { key: 'suppliers_manage', label: 'Add / Edit Suppliers',   group: 'Suppliers' },
  { key: 'products_view',    label: 'View Products',          group: 'Products'  },
  { key: 'products_manage',  label: 'Add / Edit Products',    group: 'Products'  },
  { key: 'inventory_view',   label: 'View Inventory',         group: 'Inventory' },
  { key: 'reports',          label: 'View Reports',           group: 'Reports'   },
  { key: 'settings',         label: 'Settings',               group: 'Config'    },
  { key: 'users_manage',     label: 'User Management',        group: 'Config'    },
];

const USER_PERMS = [
  'dashboard',
  'sales_view', 'sales_create',
  'purchases_view', 'purchases_create',
  'customers_view', 'suppliers_view',
  'inventory_view', 'products_view',
];

export function AuthProvider({ children }) {
  const [users, setUsers] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('bms_users') || '[]');
      if (stored.length > 0) return stored;
    } catch {}
    const initial = [SEED_ADMIN];
    localStorage.setItem('bms_users', JSON.stringify(initial));
    return initial;
  });

  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bms_auth') || 'null'); } catch { return null; }
  });

  // Persist users on change
  const setUsersAndPersist = (fn) => {
    setUsers(prev => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      localStorage.setItem('bms_users', JSON.stringify(next));
      return next;
    });
  };

  const login = (username, password) => {
    const stored = JSON.parse(localStorage.getItem('bms_users') || '[]');
    const found = stored.find(u =>
      u.username.toLowerCase() === username.toLowerCase() &&
      u.password === password &&
      u.isActive !== false
    );
    if (found) {
      const session = {
        id: found.id, username: found.username, name: found.name,
        role: found.role,
        permissions: found.permissions || USER_PERMS,
        loginAt: now(),
      };
      setCurrentUser(session);
      localStorage.setItem('bms_auth', JSON.stringify(session));
      return { ok: true };
    }
    return { ok: false, error: 'Invalid username or password' };
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('bms_auth');
  };

  const addUser = (data) => {
    const stored = JSON.parse(localStorage.getItem('bms_users') || '[]');
    if (stored.find(u => u.username.toLowerCase() === data.username.toLowerCase() && u.isActive !== false)) {
      return { ok: false, error: 'Username already exists' };
    }
    const newUser = { ...data, id: generateId('usr'), isActive: true, createdAt: now() };
    setUsersAndPersist(p => [...p, newUser]);
    return { ok: true, user: newUser };
  };

  const updateUser = (id, data) => {
    const stored = JSON.parse(localStorage.getItem('bms_users') || '[]');
    if (data.username) {
      const dup = stored.find(u => u.id !== id && u.username.toLowerCase() === data.username.toLowerCase() && u.isActive !== false);
      if (dup) return { ok: false, error: 'Username already exists' };
    }
    setUsersAndPersist(p => p.map(u => u.id === id ? { ...u, ...data } : u));
    return { ok: true };
  };

  const deactivateUser = (id) => {
    if (id === 'usr_admin') return { ok: false, error: 'Cannot deactivate the default admin' };
    setUsersAndPersist(p => p.map(u => u.id === id ? { ...u, isActive: false } : u));
    return { ok: true };
  };

  const isAdmin = currentUser?.role === 'admin';

  const can = (feature) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    const perms = currentUser.permissions || USER_PERMS;
    return perms.includes(feature);
  };

  return (
    <AuthCtx.Provider value={{
      currentUser,
      users: users.filter(u => u.isActive !== false),
      allUsers: users,
      login, logout,
      addUser, updateUser, deactivateUser,
      isAdmin, can,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
