import { createContext, useContext, useState, useEffect } from 'react';
import { api, setToken, clearToken, checkApiAvailable, isApiAvailable } from '../hooks/useApi';

// ── localStorage fallback helpers ──────────────────────────────────────────
const LS_USERS = 'bms_users';
const DEFAULT_ADMIN = { id: 'usr_admin', username: 'admin', password: 'admin123', name: 'Admin', role: 'admin', permissions: [], isActive: true };

function lsGetUsers() {
  try { return JSON.parse(localStorage.getItem(LS_USERS) || 'null') || [DEFAULT_ADMIN]; } catch { return [DEFAULT_ADMIN]; }
}
function lsSaveUsers(users) { localStorage.setItem(LS_USERS, JSON.stringify(users)); }
function lsLogin(username, password) {
  const users = lsGetUsers();
  const user = users.find(u => u.username === username && u.isActive !== false);
  if (!user) return { ok: false, error: 'User not found' };
  if (user.password !== password) return { ok: false, error: 'Invalid password' };
  const { password: _, ...safe } = user;
  return { ok: true, user: safe };
}

const AuthCtx = createContext();

// permissions are stored as JSON string in SQLite — always parse to array
function parsePerms(perms) {
  if (Array.isArray(perms)) return perms;
  try { return JSON.parse(perms || '[]'); } catch { return []; }
}

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
  'dashboard','sales_view','sales_create',
  'purchases_view','purchases_create',
  'customers_view','suppliers_view',
  'inventory_view','products_view',
];

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [authLoading, setAuthLoading] = useState(true);

  // Restore session on page load (localStorage persists across tabs/windows)
  useEffect(() => {
    const init = async () => {
      const available = await checkApiAvailable();
      if (available) {
        const stored = localStorage.getItem('bms_jwt');
        if (stored) {
          setToken(stored);
          api('/auth/me')
            .then(user => setCurrentUser({ ...user, permissions: parsePerms(user.permissions) }))
            .catch(() => { localStorage.removeItem('bms_jwt'); clearToken(); })
            .finally(() => setAuthLoading(false));
        } else {
          setAuthLoading(false);
        }
      } else {
        // Offline / dev mode: restore from localStorage
        const stored = localStorage.getItem('bms_local_user');
        if (stored) { try { setCurrentUser(JSON.parse(stored)); } catch {} }
        setAuthLoading(false);
      }
    };
    init();
  }, []);

  const login = async (username, password) => {
    const available = await checkApiAvailable();
    if (available) {
      try {
        const { token, user } = await api('/auth/login', { method: 'POST', body: { username, password } });
        setToken(token);
        localStorage.setItem('bms_jwt', token);
        setCurrentUser({ ...user, permissions: parsePerms(user.permissions) });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    } else {
      // Fallback: localStorage users
      const result = lsLogin(username, password);
      if (result.ok) {
        setCurrentUser(result.user);
        localStorage.setItem('bms_local_user', JSON.stringify(result.user));
      }
      return result;
    }
  };

  const logout = async () => {
    if (isApiAvailable()) await api('/auth/logout', { method: 'POST' }).catch(() => {});
    clearToken();
    localStorage.removeItem('bms_jwt');
    localStorage.removeItem('bms_local_user');
    setCurrentUser(null);
    setUsers([]);
  };

  const addUser = async (data) => {
    if (!isApiAvailable()) {
      const users = lsGetUsers();
      const newUser = { ...data, id: 'usr_' + Date.now(), isActive: true };
      lsSaveUsers([...users, newUser]);
      const { password: _, ...safe } = newUser;
      setUsers(p => [...p, safe]);
      return { ok: true, user: safe };
    }
    try {
      const user = await api('/users', { method: 'POST', body: data });
      setUsers(p => [...p, user]);
      return { ok: true, user };
    } catch (err) { return { ok: false, error: err.message }; }
  };

  const updateUser = async (id, data) => {
    if (!isApiAvailable()) {
      const users = lsGetUsers();
      const updated = users.map(u => u.id === id ? { ...u, ...data } : u);
      lsSaveUsers(updated);
      const safe = updated.find(u => u.id === id);
      setUsers(p => p.map(u => u.id === id ? safe : u));
      return { ok: true };
    }
    try {
      const user = await api(`/users/${id}`, { method: 'PUT', body: data });
      setUsers(p => p.map(u => u.id === id ? user : u));
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  };

  const deactivateUser = async (id) => {
    if (!isApiAvailable()) {
      const users = lsGetUsers();
      lsSaveUsers(users.map(u => u.id === id ? { ...u, isActive: false } : u));
      setUsers(p => p.filter(u => u.id !== id));
      return { ok: true };
    }
    try {
      await api(`/users/${id}`, { method: 'DELETE' });
      setUsers(p => p.filter(u => u.id !== id));
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  };

  // Lazy-load users list
  const loadUsers = async () => {
    if (!isApiAvailable()) { setUsers(lsGetUsers().map(({ password: _, ...u }) => u)); return; }
    try {
      const list = await api('/users');
      setUsers(list);
    } catch {}
  };

  const isAdmin = currentUser?.role === 'admin';

  const can = (feature) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    const perms = parsePerms(currentUser.permissions);
    // If user has no explicit permissions set, fall back to default user perms
    const effective = perms.length > 0 ? perms : USER_PERMS;
    return effective.includes(feature);
  };

  return (
    <AuthCtx.Provider value={{
      currentUser, users, allUsers: users,
      login, logout, addUser, updateUser, deactivateUser, loadUsers,
      isAdmin, can, authLoading,
    }}>
      {!authLoading && children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
