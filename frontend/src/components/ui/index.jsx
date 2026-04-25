import { useState } from 'react';

export function Button({ children, onClick, variant = 'primary', size = 'md', disabled, className = '', type = 'button' }) {
  const base = 'inline-flex items-center gap-2 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1';
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-base' };
  const variants = {
    primary:   'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-400 dark:bg-[#2C2C2E] dark:text-[#f2f2f7] dark:hover:bg-[#3A3A3C]',
    danger:    'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 dark:bg-[#FF453A] dark:hover:bg-[#FF6961]',
    ghost:     'text-gray-600 hover:bg-gray-100 focus:ring-gray-400 dark:text-[#ebebf599] dark:hover:bg-[#2C2C2E]',
    success:   'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 dark:bg-[#30D158] dark:hover:bg-[#34C759]',
    outline:   'border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-400 dark:border-[rgba(84,84,88,0.65)] dark:text-[#f2f2f7] dark:hover:bg-[#2C2C2E]',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${sizes[size]} ${variants[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      {children}
    </button>
  );
}

export function Input({ label, error, className = '', ...props }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="text-sm font-medium text-gray-700 dark:text-[#ebebf599]">{label}</label>}
      <input className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#2C2C2E] dark:text-white dark:placeholder-[#636366] ${error ? 'border-red-400' : 'border-gray-300 dark:border-[rgba(84,84,88,0.65)]'}`} {...props} />
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

export function Select({ label, error, children, className = '', ...props }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="text-sm font-medium text-gray-700 dark:text-[#ebebf599]">{label}</label>}
      <select className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#2C2C2E] dark:text-white ${error ? 'border-red-400' : 'border-gray-300 dark:border-[rgba(84,84,88,0.65)]'}`} {...props}>
        {children}
      </select>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

export function Textarea({ label, error, className = '', ...props }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="text-sm font-medium text-gray-700 dark:text-[#ebebf599]">{label}</label>}
      <textarea className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white dark:bg-[#2C2C2E] dark:text-white dark:placeholder-[#636366] ${error ? 'border-red-400' : 'border-gray-300 dark:border-[rgba(84,84,88,0.65)]'}`} {...props} />
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

export function Card({ children, className = '', padding = true }) {
  return <div className={`bg-white dark:bg-[#1C1C1E] rounded-xl border border-gray-200 dark:border-[rgba(84,84,88,0.65)] shadow-sm ${padding ? 'p-5' : ''} ${className}`}>{children}</div>;
}

export function Badge({ children, color = 'gray' }) {
  const colors = {
    gray:   'bg-gray-100 text-gray-700 dark:bg-[#3A3A3C] dark:text-[#f2f2f7]',
    blue:   'bg-blue-100 text-blue-700 dark:bg-[rgba(10,132,255,0.2)] dark:text-[#0A84FF]',
    green:  'bg-green-100 text-green-700 dark:bg-[rgba(48,209,88,0.2)] dark:text-[#30D158]',
    red:    'bg-red-100 text-red-700 dark:bg-[rgba(255,69,58,0.2)] dark:text-[#FF453A]',
    yellow: 'bg-yellow-100 text-yellow-700 dark:bg-[rgba(255,214,10,0.2)] dark:text-[#FFD60A]',
    purple: 'bg-purple-100 text-purple-700 dark:bg-[rgba(191,90,242,0.2)] dark:text-[#BF5AF2]',
    orange: 'bg-orange-100 text-orange-700 dark:bg-[rgba(255,159,10,0.2)] dark:text-[#FF9F0A]',
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>{children}</span>;
}

export function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className={`bg-white dark:bg-[#1C1C1E] rounded-xl shadow-xl w-full ${sizes[size]} max-h-[90vh] flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[rgba(84,84,88,0.65)]">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-[#636366] dark:hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">{children}</div>
      </div>
    </div>
  );
}

export function StatCard({ title, value, sub, icon, color = 'blue' }) {
  const colors = { blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400', green: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400', red: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400', purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400', orange: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' };
  return (
    <Card className="flex items-start gap-4">
      {icon && <div className={`p-3 rounded-xl text-xl ${colors[color]}`}>{icon}</div>}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </Card>
  );
}

export function Table({ columns, data, onRowClick, emptyMsg = 'No records found' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-[#1C1C1E] border-b border-gray-200 dark:border-[rgba(84,84,88,0.65)]">
            {columns.map((col, i) => (
              <th key={i} className={`px-4 py-3 text-xs font-semibold text-gray-500 dark:text-[#636366] uppercase tracking-wide ${col.align === 'right' ? 'text-right' : 'text-left'}`} style={col.width ? { width: col.width } : {}}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={columns.length} className="text-center py-12 text-gray-400 dark:text-gray-500">{emptyMsg}</td></tr>
          ) : data.map((row, ri) => (
            <tr key={ri} className={`border-b border-gray-100 dark:border-[rgba(84,84,88,0.35)] hover:bg-gray-50 dark:hover:bg-[#2C2C2E] ${onRowClick ? 'cursor-pointer' : ''}`} onClick={() => onRowClick?.(row)}>
              {columns.map((col, ci) => (
                <td key={ci} className={`px-4 py-3 text-gray-800 dark:text-[#f2f2f7] ${col.align === 'right' ? 'text-right' : ''}`}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 w-full" />
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-gray-600 dark:text-gray-300 mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={() => { onConfirm(); onClose(); }}>Delete</Button>
      </div>
    </Modal>
  );
}

export function Toast({ toasts, remove }) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm ${t.type === 'error' ? 'bg-red-600' : t.type === 'warning' ? 'bg-yellow-500' : 'bg-green-600'}`}>
          <span>{t.message}</span>
          <button onClick={() => remove(t.id)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = (message, type = 'success') => {
    const id = Date.now();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  };
  const remove = (id) => setToasts(p => p.filter(t => t.id !== id));
  return { toasts, remove, success: m => add(m, 'success'), error: m => add(m, 'error'), warning: m => add(m, 'warning') };
}

export function Pagination({ total, page, pageSize, onChange }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
      <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
      <div className="flex gap-1">
        {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
          <button key={p} onClick={() => onChange(p)} className={`px-3 py-1 rounded ${p === page ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-300'}`}>{p}</button>
        ))}
      </div>
    </div>
  );
}
