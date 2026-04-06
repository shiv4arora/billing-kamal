import { useState } from 'react';
import { useAuth, ALL_PERMISSIONS } from '../../context/AuthContext';
import { Button, Card, Modal, Input, Select } from '../../components/ui';

const ROLE_COLOR = { admin: 'bg-red-100 text-red-700', user: 'bg-blue-100 text-blue-700' };

const DEFAULT_USER_PERMS = [
  'dashboard', 'sales_view', 'sales_create',
  'purchases_view', 'purchases_create',
  'customers_view', 'suppliers_view',
  'inventory_view', 'products_view',
];

const BLANK_FORM = { name: '', username: '', password: '', role: 'user', permissions: [...DEFAULT_USER_PERMS] };

// Group ALL_PERMISSIONS by their group label
const PERM_GROUPS = ALL_PERMISSIONS.reduce((acc, p) => {
  if (!acc[p.group]) acc[p.group] = [];
  acc[p.group].push(p);
  return acc;
}, {});

export default function UserManagement() {
  const { users, addUser, updateUser, deactivateUser, currentUser } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [showPw, setShowPw] = useState(false);

  const set = (f, v) => { setForm(p => ({ ...p, [f]: v })); setErrors(e => ({ ...e, [f]: '' })); setApiError(''); };

  const handleRoleChange = (role) => {
    setForm(p => ({
      ...p,
      role,
      // When switching to user, reset to default perms; admin doesn't use perms
      permissions: role === 'admin' ? [] : [...DEFAULT_USER_PERMS],
    }));
    setApiError('');
  };

  const togglePerm = (key) => {
    setForm(p => ({
      ...p,
      permissions: p.permissions.includes(key)
        ? p.permissions.filter(k => k !== key)
        : [...p.permissions, key],
    }));
  };

  const toggleGroup = (groupKeys) => {
    const allOn = groupKeys.every(k => form.permissions.includes(k));
    setForm(p => ({
      ...p,
      permissions: allOn
        ? p.permissions.filter(k => !groupKeys.includes(k))
        : [...new Set([...p.permissions, ...groupKeys])],
    }));
  };

  const openAdd = () => {
    setForm(BLANK_FORM);
    setEditId(null);
    setErrors({});
    setApiError('');
    setShowPw(false);
    setModalOpen(true);
  };

  const openEdit = (u) => {
    setForm({
      name: u.name,
      username: u.username,
      password: '',
      role: u.role,
      permissions: u.permissions || [...DEFAULT_USER_PERMS],
    });
    setEditId(u.id);
    setErrors({});
    setApiError('');
    setShowPw(false);
    setModalOpen(true);
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.username.trim()) e.username = 'Username is required';
    if (!editId && !form.password) e.password = 'Password is required for new users';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSave = () => {
    if (!validate()) return;
    const data = {
      name: form.name.trim(),
      username: form.username.trim(),
      role: form.role,
      permissions: form.role === 'admin' ? [] : form.permissions,
    };
    if (form.password) data.password = form.password;

    const result = editId ? updateUser(editId, data) : addUser({ ...data, password: form.password });
    if (!result.ok) { setApiError(result.error); return; }
    setModalOpen(false);
  };

  const handleDeactivate = (u) => {
    if (!confirm(`Deactivate user "${u.name}"? They will not be able to log in.`)) return;
    const result = deactivateUser(u.id);
    if (!result.ok) alert(result.error);
  };

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage staff accounts and access permissions</p>
        </div>
        <Button onClick={openAdd}>+ Add User</Button>
      </div>

      {/* User list */}
      <Card padding={false}>
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-800">Active Users ({users.length})</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Username</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Permissions</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {u.name}
                  {u.id === currentUser?.id && (
                    <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">You</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-gray-600">{u.username}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLOR[u.role] || 'bg-gray-100 text-gray-700'}`}>
                    {u.role.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {u.role === 'admin'
                    ? <span className="text-red-600 font-medium">Full Access</span>
                    : `${(u.permissions || DEFAULT_USER_PERMS).length} of ${ALL_PERMISSIONS.length} permissions`
                  }
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>Edit</Button>
                    {u.id !== 'usr_admin' && u.id !== currentUser?.id && (
                      <Button size="sm" variant="ghost" onClick={() => handleDeactivate(u)}>
                        <span className="text-red-500">Deactivate</span>
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit User' : 'Add New User'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Full Name *"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Ravi Kumar"
              error={errors.name}
            />
            <Input
              label="Username *"
              value={form.username}
              onChange={e => set('username', e.target.value)}
              placeholder="e.g. ravi123"
              error={errors.username}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password {editId && <span className="text-xs font-normal text-gray-400">(leave blank to keep current)</span>}
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder={editId ? 'New password (optional)' : 'Set a password *'}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 ${errors.password ? 'border-red-400' : 'border-gray-300'}`}
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

          {/* Permissions — only for user role */}
          {form.role === 'user' && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Permissions</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, permissions: ALL_PERMISSIONS.map(x => x.key) }))}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, permissions: [] }))}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    Clear All
                  </button>
                </div>
              </div>
              <div className="p-4 space-y-4 max-h-72 overflow-y-auto">
                {Object.entries(PERM_GROUPS).map(([group, perms]) => {
                  const groupKeys = perms.map(p => p.key);
                  const allOn = groupKeys.every(k => form.permissions.includes(k));
                  const someOn = groupKeys.some(k => form.permissions.includes(k));
                  return (
                    <div key={group}>
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <input
                          type="checkbox"
                          checked={allOn}
                          ref={el => { if (el) el.indeterminate = !allOn && someOn; }}
                          onChange={() => toggleGroup(groupKeys)}
                          className="rounded text-blue-600"
                        />
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{group}</span>
                      </label>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pl-5">
                        {perms.map(p => (
                          <label key={p.key} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form.permissions.includes(p.key)}
                              onChange={() => togglePerm(p.key)}
                              className="rounded text-blue-600"
                            />
                            <span className="text-sm text-gray-700">{p.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-400">
                {form.permissions.length} of {ALL_PERMISSIONS.length} permissions selected
              </div>
            </div>
          )}

          {apiError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">⚠ {apiError}</div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editId ? 'Update User' : 'Create User'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
