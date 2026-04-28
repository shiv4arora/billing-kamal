import { useState, useEffect } from 'react';
import { useAuth, ALL_PERMISSIONS } from '../../context/AuthContext';
import { Button, Card, Modal, Input, Select } from '../../components/ui';

const ROLE_COLOR = {
  admin: 'bg-red-100 text-red-700 dark:bg-[rgba(255,69,58,0.2)] dark:text-[#FF453A]',
  user:  'bg-blue-100 text-blue-700 dark:bg-[rgba(10,132,255,0.2)] dark:text-[#0A84FF]',
};

const DEFAULT_USER_PERMS = [
  'dashboard',
  'sales_view', 'sales_create', 'sale_returns', 'quotations',
  'purchases_view', 'purchases_create', 'purchase_returns',
  'production',
  'customers_view', 'suppliers_view',
  'inventory_view', 'products_view',
  'crm',
];

const BLANK_FORM = { name: '', username: '', password: '', role: 'user', permissions: [...DEFAULT_USER_PERMS] };

const PERM_GROUPS = ALL_PERMISSIONS.reduce((acc, p) => {
  if (!acc[p.group]) acc[p.group] = [];
  acc[p.group].push(p);
  return acc;
}, {});

export default function UserManagement() {
  const { users, addUser, updateUser, deactivateUser, loadUsers, currentUser } = useAuth();
  const [saving, setSaving] = useState(false);
  useEffect(() => { loadUsers(); }, []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId,    setEditId]    = useState(null);
  const [form,      setForm]      = useState(BLANK_FORM);
  const [errors,    setErrors]    = useState({});
  const [apiError,  setApiError]  = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [expanded,  setExpanded]  = useState(null); // user id whose perms are expanded in list

  const set = (f, v) => { setForm(p => ({ ...p, [f]: v })); setErrors(e => ({ ...e, [f]: '' })); setApiError(''); };

  const handleRoleChange = (role) => {
    setForm(p => {
      if (role === p.role) return p; // no actual change — don't touch permissions
      if (role === 'admin') return { ...p, role, permissions: [] };
      // Switching back to user: keep existing perms if any, else use defaults
      return { ...p, role, permissions: p.permissions.length > 0 ? p.permissions : [...DEFAULT_USER_PERMS] };
    });
    setApiError('');
  };

  const openAdd = () => { setForm(BLANK_FORM); setEditId(null); setErrors({}); setApiError(''); setShowPw(false); setModalOpen(true); };
  const openEdit = (u) => {
    // u.permissions is always an array from the API; fall back to defaults only when truly empty (legacy accounts)
    const perms = Array.isArray(u.permissions) && u.permissions.length > 0 ? u.permissions : [...DEFAULT_USER_PERMS];
    setForm({ name: u.name, username: u.username, password: '', role: u.role, permissions: perms });
    setEditId(u.id); setErrors({}); setApiError(''); setShowPw(false); setModalOpen(true);
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.username.trim()) e.username = 'Username is required';
    if (!editId && !form.password) e.password = 'Password is required for new users';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSave = async () => {
    if (!validate() || saving) return;
    setSaving(true);
    const data = {
      name: form.name.trim(),
      username: form.username.trim(),
      role: form.role,
      permissions: form.role === 'admin' ? [] : form.permissions,
    };
    if (form.password) data.password = form.password;
    const result = await (editId ? updateUser(editId, data) : addUser({ ...data, password: form.password }));
    if (!result.ok) { setApiError(result.error); setSaving(false); return; }
    await loadUsers(); // reload from server so the list always shows actual saved values
    setSaving(false);
    setModalOpen(false);
  };

  const handleDeactivate = async (u) => {
    if (!confirm(`Deactivate user "${u.name}"? They will not be able to log in.`)) return;
    const result = await deactivateUser(u.id);
    if (!result.ok) alert(result.error);
  };

  const inputCls = 'w-full border border-gray-300 dark:border-[rgba(84,84,88,0.65)] rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#2C2C2E] dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage staff accounts and access permissions</p>
        </div>
        <Button onClick={openAdd}>+ Add User</Button>
      </div>

      {/* Permission legend */}
      <Card>
        <div className="flex items-start gap-3">
          <span className="text-2xl">🔐</span>
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white">How permissions work</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              <strong className="text-red-600 dark:text-[#FF453A]">Admin</strong> — full access to everything, ignores permission list.{' '}
              <strong className="text-blue-600 dark:text-[#0A84FF]">User</strong> — only sees and can use what you explicitly grant below.
              Routes, sidebar items, and action buttons are all hidden when a permission is off.
            </p>
          </div>
        </div>
      </Card>

      {/* User list */}
      <Card padding={false}>
        <div className="px-5 py-4 border-b border-gray-200 dark:border-[rgba(84,84,88,0.65)]">
          <h3 className="font-semibold text-gray-800 dark:text-white">Active Users ({users.length})</h3>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-[rgba(84,84,88,0.35)]">
          {users.map(u => {
            const perms = u.permissions || DEFAULT_USER_PERMS;
            const permLabels = ALL_PERMISSIONS.filter(p => perms.includes(p.key)).map(p => p.label);
            const isExpanded = expanded === u.id;

            return (
              <div key={u.id} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#2C2C2E]">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-blue-600 dark:bg-[#0A84FF] flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {(u.name || u.username)[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white text-sm">{u.name}</span>
                      {u.id === currentUser?.id && (
                        <span className="text-xs bg-green-100 dark:bg-[rgba(48,209,88,0.2)] text-green-700 dark:text-[#30D158] px-1.5 py-0.5 rounded-full font-semibold">You</span>
                      )}
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLOR[u.role] || 'bg-gray-100 text-gray-700'}`}>
                        {u.role.toUpperCase()}
                      </span>
                      <span className="text-xs font-mono text-gray-400 dark:text-gray-500">@{u.username}</span>
                    </div>
                    <div className="mt-1">
                      {u.role === 'admin' ? (
                        <span className="text-xs text-red-600 dark:text-[#FF453A] font-medium">Full Access — all features</span>
                      ) : (
                        <button
                          onClick={() => setExpanded(isExpanded ? null : u.id)}
                          className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-[#0A84FF] transition-colors"
                        >
                          {permLabels.length} of {ALL_PERMISSIONS.length} permissions {isExpanded ? '▲' : '▼'}
                        </button>
                      )}
                    </div>
                    {/* Expanded permission list */}
                    {isExpanded && u.role !== 'admin' && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {ALL_PERMISSIONS.map(p => (
                          <span key={p.key}
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              perms.includes(p.key)
                                ? 'bg-green-100 dark:bg-[rgba(48,209,88,0.15)] text-green-700 dark:text-[#30D158]'
                                : 'bg-gray-100 dark:bg-[#3A3A3C] text-gray-400 dark:text-[#636366] line-through'
                            }`}>
                            {p.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>Edit</Button>
                    {u.id !== 'usr_admin' && u.id !== currentUser?.id && (
                      <Button size="sm" variant="ghost" onClick={() => handleDeactivate(u)}>
                        <span className="text-red-500 dark:text-[#FF453A]">Deactivate</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit User' : 'Add New User'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Full Name *" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Ravi Kumar" error={errors.name} />
            <Input label="Username *" value={form.username} onChange={e => set('username', e.target.value)} placeholder="e.g. ravi123" error={errors.username} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#ebebf599] mb-1">
              Password {editId && <span className="text-xs font-normal text-gray-400">(leave blank to keep current)</span>}
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder={editId ? 'New password (optional)' : 'Set a password *'}
                className={`${inputCls} pr-10 ${errors.password ? 'border-red-400' : ''}`}
              />
              <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
          </div>

          <Select label="Role *" value={form.role} onChange={e => handleRoleChange(e.target.value)}>
            <option value="admin">Admin — Full Access (all features)</option>
            <option value="user">User — Staff Access (custom permissions)</option>
          </Select>

          {form.role === 'user' && (
            <div className="border border-gray-200 dark:border-[rgba(84,84,88,0.65)] rounded-xl overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 bg-gray-50 dark:bg-[#2C2C2E] border-b border-gray-200 dark:border-[rgba(84,84,88,0.65)] flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700 dark:text-white">
                  Permissions <span className="font-normal text-gray-400 dark:text-gray-500">({form.permissions.length}/{ALL_PERMISSIONS.length})</span>
                </p>
                <div className="flex gap-3">
                  <button type="button"
                    onClick={() => setForm(p => ({ ...p, permissions: ALL_PERMISSIONS.map(x => x.key) }))}
                    className="text-xs text-blue-600 dark:text-[#0A84FF] font-medium active:opacity-60">
                    All
                  </button>
                  <button type="button"
                    onClick={() => setForm(p => ({ ...p, permissions: [...DEFAULT_USER_PERMS] }))}
                    className="text-xs text-green-600 dark:text-[#30D158] font-medium active:opacity-60">
                    Default
                  </button>
                  <button type="button"
                    onClick={() => setForm(p => ({ ...p, permissions: [] }))}
                    className="text-xs text-gray-400 dark:text-gray-500 font-medium active:opacity-60">
                    None
                  </button>
                </div>
              </div>

              {/* Permission pills — tap to toggle, no checkboxes */}
              <div className="p-4 max-h-72 overflow-y-auto dark:bg-[#1C1C1E] space-y-4">
                {Object.entries(PERM_GROUPS).map(([group, perms]) => (
                  <div key={group}>
                    <p className="text-[10px] font-bold text-gray-400 dark:text-[#636366] uppercase tracking-widest mb-2">{group}</p>
                    <div className="flex flex-wrap gap-2">
                      {perms.map(p => {
                        const on = form.permissions.includes(p.key);
                        return (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => {
                              setForm(prev => ({
                                ...prev,
                                permissions: prev.permissions.includes(p.key)
                                  ? prev.permissions.filter(k => k !== p.key)
                                  : [...prev.permissions, p.key],
                              }));
                            }}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors select-none active:scale-95 ${
                              on
                                ? 'bg-blue-600 text-white dark:bg-[#0A84FF]'
                                : 'bg-gray-100 text-gray-500 dark:bg-[#3A3A3C] dark:text-[#8E8E93] hover:bg-gray-200 dark:hover:bg-[#48484A]'
                            }`}
                          >
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

          {apiError && (
            <div className="bg-red-50 dark:bg-[rgba(255,69,58,0.1)] border border-red-200 dark:border-[rgba(255,69,58,0.3)] rounded-lg px-3 py-2 text-sm text-red-700 dark:text-[#FF453A]">
              ⚠ {apiError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-[rgba(84,84,88,0.35)]">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editId ? 'Update User' : 'Create User'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
