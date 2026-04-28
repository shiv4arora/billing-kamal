import { useState, useEffect } from 'react';
import { api } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui';
import { formatDate } from '../../utils/helpers';

const ACTION_STYLE = {
  ISSUE:   'bg-green-100 text-green-700 dark:bg-[rgba(48,209,88,0.15)] dark:text-[#30D158]',
  CREATE:  'bg-blue-100 text-blue-700 dark:bg-[rgba(10,132,255,0.15)] dark:text-[#0A84FF]',
  UPDATE:  'bg-yellow-100 text-yellow-700 dark:bg-[rgba(255,214,10,0.15)] dark:text-[#FFD60A]',
  DELETE:  'bg-red-100 text-red-700 dark:bg-[rgba(255,69,58,0.15)] dark:text-[#FF453A]',
  PAYMENT: 'bg-purple-100 text-purple-700 dark:bg-[rgba(191,90,242,0.15)] dark:text-[#BF5AF2]',
  LOGIN:   'bg-gray-100 text-gray-600 dark:bg-[rgba(142,142,147,0.15)] dark:text-[#8E8E93]',
};

const ENTITY_EMOJI = {
  SaleInvoice:     '🧾',
  PurchaseInvoice: '📦',
  Production:      '⚙️',
  Lead:            '👤',
  User:            '🔐',
};

function fmt(dt) {
  const d = new Date(dt);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ActivityLog() {
  const { users } = useAuth();
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId,  setUserId]  = useState('');
  const [entity,  setEntity]  = useState('');
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      if (entity) params.set('entity', entity);
      if (from)   params.set('from', from);
      if (to)     params.set('to', to);
      params.set('limit', '300');
      const data = await api('/activity-logs?' + params.toString());
      setLogs(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const inputCls = 'border border-gray-300 dark:border-[rgba(84,84,88,0.65)] rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-[#2C2C2E] dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activity Log</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Who did what and when — last 300 actions</p>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">User</label>
            <select value={userId} onChange={e => setUserId(e.target.value)} className={inputCls}>
              <option value="">All users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Type</label>
            <select value={entity} onChange={e => setEntity(e.target.value)} className={inputCls}>
              <option value="">All types</option>
              <option value="SaleInvoice">Sale Invoice</option>
              <option value="PurchaseInvoice">Purchase Invoice</option>
              <option value="Production">Production</option>
              <option value="Lead">Lead / CRM</option>
              <option value="User">User</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
          </div>
          <button onClick={load} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            Apply
          </button>
          <button onClick={() => { setUserId(''); setEntity(''); setFrom(''); setTo(''); setTimeout(load, 0); }}
            className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            Clear
          </button>
        </div>
      </Card>

      {/* Log table */}
      <Card padding={false}>
        {loading ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">No activity yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Actions like issuing invoices, creating production entries, and user changes will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-[rgba(84,84,88,0.3)]">
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#2C2C2E]">
                {/* Entity icon */}
                <span className="text-xl mt-0.5 shrink-0">{ENTITY_EMOJI[log.entity] || '📌'}</span>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ACTION_STYLE[log.action] || ACTION_STYLE.CREATE}`}>
                      {log.action}
                    </span>
                    <span className="text-sm font-semibold text-gray-800 dark:text-white">
                      {log.entity}
                      {log.entityRef && <span className="ml-1 font-mono text-blue-600 dark:text-[#0A84FF] text-xs">#{log.entityRef}</span>}
                    </span>
                    {log.details && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">{log.details}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      👤 <span className="font-medium text-gray-700 dark:text-gray-300">{log.userName || log.userId || 'System'}</span>
                    </span>
                    <span className="text-gray-300 dark:text-gray-600">·</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{fmt(log.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {logs.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-100 dark:border-[rgba(84,84,88,0.3)] text-xs text-gray-400 dark:text-gray-500">
            {logs.length} entries shown
          </div>
        )}
      </Card>
    </div>
  );
}
