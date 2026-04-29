import { useState, useEffect } from 'react';
import { useAuth, ALL_PERMISSIONS } from '../../context/AuthContext';
import { api } from '../../hooks/useApi';
import { Button, Card } from '../../components/ui';

const DEFAULT_USER_PERMS = [
  'dashboard',
  'sales_view', 'sales_create', 'sale_returns', 'quotations',
  'purchases_view', 'purchases_create', 'purchase_returns',
  'production',
  'customers_view', 'suppliers_view',
  'inventory_view', 'products_view',
  'crm',
];

const BLANK = { name: '', username: '', password: '', role: 'user', permissions: [] };

const PERM_GROUPS = ALL_PERMISSIONS.reduce((acc, p) => {
  if (!acc[p.group]) acc[p.group] = [];
  acc[p.group].push(p);
  return acc;
}, {});

const inputCls = 'w-full border border-gray-300 dark:border-[rgba(84,84,88,0.65)] rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#2C2C2E] dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function UserManagement() {
  const { currentUser } = useAuth();

  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);

  // panel state
  const [panel,   setPanel]   = useState(null); // null | 'add' | {user}
  const [form,    setForm]    = useState(BLANK);
  const [showPw,  setShowPw]  = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    try { setUsers(await api('/users')); } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setForm(BLANK);
    setErr(''); setSuccess(''); setShowPw(false);
    setPanel('add');
  };

  const openEdit = (u) => {
    const perms = Array.isArray(u.permissions) ? u.permissions : [];
    setForm({ name: u.name, username: u.username, password: '', role: u.role, permissions: perms });
    setErr(''); setSuccess(''); setShowPw(false);
    setPanel(u);
  };

  const closePanel = () => { setPanel(null); setErr(''); setSuccess(''); };

  const setf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const togglePerm = (key) => setForm(p => ({
    ...p,
    permissions: p.permissions.includes(key)
      ? p.permissions.filter(k => k !== key)
      : [...p.permissions, key],
  }));

  const handleSave = async () => {
    if (!form.name.trim())     { setErr('Name is required'); return; }
    if (!form.username.trim()) { setErr('Username is required'); return; }
    if (panel === 'add' && !form.password) { setErr('Password is required'); return; }
    setSaving(true); setErr('');
    try {
      const body = {
        name: form.name.trim(),
        username: form.username.trim(),
        role: form.role,
        permissions: form.role === 'admin' ? [] : form.permissions,
      };
      if (form.password) body.password = form.password;

      if (panel === 'add') {
        await api('/users', { method: 'POST', body });
      } else {
        await api(`/users/${panel.id}`, { method: 'PUT', body });
      }
      setSuccess(panel === 'add' ? 'User created!' : 'Changes saved!');
      await load();
      setTimeout(() => { closePanel(); }, 800);
    } catch (e) {
      setErr(e.message || 'Save failed');
    }
    setSaving(false);
  };

  const handleDeactivate = async (u) => {
    if (!confirm(`Deactivate "${u.name}"? They will not be able to log in.`)) return;
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' });
      await load();
    } catch (e) { alert(e.message); }
  };

  const isEditing = panel !== null;

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage staff accounts and permissions</p>
        </div>
        {!isEditing && <Button onClick={openAdd}>+ Add User</Button>}
      </div>

      {/* ── EDIT / ADD PANEL ─────────────────────────────────────────── */}
      {isEditing && (
        <Card>
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 dark:border-[rgba(84,84,88,0.35)]">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {panel === 'add' ? 'Add New User' : `Edit — ${panel.name}`}
            </h2>
            <button onClick={closePanel} className="text-gray-400 hover:text-gray-600 dark:hover:text-white text-lg">✕</button>
          </div>

          <div className="space-y-4">
            {/* Name + Username */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-[#ebebf599] mb-1">Full Name *</label>
                <input value={form.name} onChange={e => setf('name', e.target.value)}
                  placeholder="e.g. Ravi Kumar" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-[#ebebf599] mb-1">Username *</label>
                <input value={form.username} onChange={e => setf('username', e.target.value)}
                  placeholder="e.g. ravi123" autoCapitalize="off" autoCorrect="off" className={inputCls} />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[#ebebf599] mb-1">
                Password {panel !== 'add' && <span className="text-xs font-normal text-gray-400">(leave blank to keep current)</span>}
              </label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={form.password}
                  onChange={e => setf('password', e.target.value)}
                  placeholder={panel === 'add' ? 'Set a password *' : 'New password (optional)'}
                  className={inputCls} />
                <button type="button" onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[#ebebf599] mb-1">Role *</label>
              <select value={form.role}
                onChange={e => {
                  const role = e.target.value;
                  setForm(p => role === p.role ? p : { ...p, role, permissions: [] });
                }}
                className={inputCls}>
                <option value="admin">Admin — Full access to everything</option>
                <option value="user">User — Custom permissions below</option>
              </select>
            </div>

            {/* Permissions */}
            {form.role === 'user' && (
              <div className="border border-gray-200 dark:border-[rgba(84,84,88,0.65)] rounded-xl">
                {/* header */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-[#2C2C2E] rounded-t-xl border-b border-gray-200 dark:border-[rgba(84,84,88,0.65)]">
                  <span className="text-sm font-semibold text-gray-700 dark:text-white">
                    Permissions
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      {form.permissions.length} / {ALL_PERMISSIONS.length} selected
                    </span>
                  </span>
                  <div className="flex gap-3 text-xs font-medium">
                    <button type="button" onClick={() => setForm(p => ({ ...p, permissions: ALL_PERMISSIONS.map(x => x.key) }))}
                      className="text-blue-600 dark:text-[#0A84FF]">All</button>
                    <button type="button" onClick={() => setForm(p => ({ ...p, permissions: [...DEFAULT_USER_PERMS] }))}
                      className="text-green-600 dark:text-[#30D158]">Default</button>
                    <button type="button" onClick={() => setForm(p => ({ ...p, permissions: [] }))}
                      className="text-gray-400">None</button>
                  </div>
                </div>

                {/* pills — no nested scroll, expands naturally */}
                <div className="p-4 dark:bg-[#1C1C1E] rounded-b-xl space-y-4">
                  {Object.entries(PERM_GROUPS).map(([group, items]) => (
                    <div key={group}>
                      <p className="text-[10px] font-bold text-gray-400 dark:text-[#636366] uppercase tracking-widest mb-2">{group}</p>
                      <div className="flex flex-wrap gap-2">
                        {items.map(p => {
                          const on = form.permissions.includes(p.key);
                          return (
                            <button key={p.key} type="button"
                              onClick={() => togglePerm(p.key)}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium select-none transition-colors ${
                                on
                                  ? 'bg-blue-600 text-white dark:bg-[#0A84FF]'
                                  : 'bg-gray-100 text-gray-500 dark:bg-[#3A3A3C] dark:text-[#8E8E93]'
                              }`}>
                              {on ? '✓ ' : ''}{p.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error / Success */}
            {err && (
              <div className="bg-red-50 dark:bg-[rgba(255,69,58,0.1)] border border-red-200 dark:border-[rgba(255,69,58,0.3)] rounded-lg px-3 py-2 text-sm text-red-700 dark:text-[#FF453A]">
                ⚠ {err}
              </div>
            )}
            {success && (
              <div className="bg-green-50 dark:bg-[rgba(48,209,88,0.1)] border border-green-200 dark:border-[rgba(48,209,88,0.3)] rounded-lg px-3 py-2 text-sm text-green-700 dark:text-[#30D158]">
                ✓ {success}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-[rgba(84,84,88,0.35)]">
              <Button variant="secondary" onClick={closePanel} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : panel === 'add' ? 'Create User' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── USER LIST ─────────────────────────────────────────────────── */}
      <Card padding={false}>
        <div className="px-5 py-4 border-b border-gray-200 dark:border-[rgba(84,84,88,0.65)] flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 dark:text-white">Users ({users.length})</h3>
          {isEditing && <Button onClick={openAdd}>+ Add User</Button>}
        </div>

        {loading ? (
          <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-[rgba(84,84,88,0.35)]">
            {users.map(u => {
              const perms = Array.isArray(u.permissions) ? u.permissions : [];
              const active = panel !== 'add' && panel?.id === u.id;
              return (
                <div key={u.id} className={`px-4 py-3 ${active ? 'bg-blue-50 dark:bg-[rgba(10,132,255,0.08)]' : 'hover:bg-gray-50 dark:hover:bg-[#2C2C2E]'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-600 dark:bg-[#0A84FF] flex items-center justify-center text-white font-bold shrink-0">
                      {(u.name || u.username)[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 dark:text-white text-sm">{u.name}</span>
                        {u.id === currentUser?.id && (
                          <span className="text-[10px] bg-green-100 dark:bg-[rgba(48,209,88,0.2)] text-green-700 dark:text-[#30D158] px-1.5 py-0.5 rounded-full font-semibold">You</span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${u.role === 'admin' ? 'bg-red-100 text-red-700 dark:bg-[rgba(255,69,58,0.2)] dark:text-[#FF453A]' : 'bg-blue-100 text-blue-700 dark:bg-[rgba(10,132,255,0.2)] dark:text-[#0A84FF]'}`}>
                          {u.role.toUpperCase()}
                        </span>
                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500">@{u.username}</span>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {u.role === 'admin' ? 'Full access' : `${perms.length} of ${ALL_PERMISSIONS.length} permissions`}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant={active ? 'primary' : 'ghost'} onClick={() => active ? closePanel() : openEdit(u)}>
                        {active ? 'Editing…' : 'Edit'}
                      </Button>
                      {u.id !== 'usr_admin' && u.id !== currentUser?.id && (
                        <Button size="sm" variant="ghost" onClick={() => handleDeactivate(u)}>
                          <span className="text-red-500 dark:text-[#FF453A]">Remove</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
