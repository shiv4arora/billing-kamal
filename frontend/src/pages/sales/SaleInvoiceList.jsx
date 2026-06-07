import { useState, useRef, useCallback, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInvoices } from '../../context/InvoiceContext';
import { Button, Table, Badge, Card } from '../../components/ui';
import { formatCurrency, formatDate, formatCustomerDisplay } from '../../utils/helpers';

const FILTERS = [
  { label: 'All',        value: 'all' },
  { label: 'Today',      value: 'today' },
  { label: 'Last 3 Days',value: 'last3' },
  { label: 'Paid',       value: 'paid' },
  { label: 'Unpaid',     value: 'unpaid' },
  { label: 'Credit',     value: 'credit' },
  { label: 'Draft',      value: 'draft' },
  { label: 'Issued',     value: 'issued' },
  { label: 'Completed',  value: 'completed' },
  { label: 'Deleted',    value: 'void' },
];

// 'void' is the internal status; shown to users as "Deleted"
const statusLabel = (s) => (s === 'void' ? 'deleted' : s);

// Manual payment status (label only) — Paid / Unpaid / Credit
const PAY = {
  paid:   { label: 'Paid',   pill: 'bg-green-100 text-green-700', chip: 'bg-green-600 text-white border-green-600' },
  unpaid: { label: 'Unpaid', pill: 'bg-red-100 text-red-700',     chip: 'bg-red-500 text-white border-red-500' },
  credit: { label: 'Credit', pill: 'bg-amber-100 text-amber-700', chip: 'bg-amber-500 text-white border-amber-500' },
};
const payOf = (s) => (s === 'partial' ? 'credit' : (PAY[s] ? s : 'unpaid'));

// Active-chip colours by filter value
const FILTER_ACTIVE = {
  all:       'bg-gray-900 text-white border-gray-900',
  today:     'bg-purple-600 text-white border-purple-600',
  last3:     'bg-indigo-600 text-white border-indigo-600',
  paid:      'bg-green-600 text-white border-green-600',
  unpaid:    'bg-red-500 text-white border-red-500',
  credit:    'bg-amber-500 text-white border-amber-500',
  draft:     'bg-gray-600 text-white border-gray-600',
  issued:    'bg-blue-600 text-white border-blue-600',
  completed: 'bg-emerald-600 text-white border-emerald-600',
  void:      'bg-red-600 text-white border-red-600',
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const nDaysAgoStr = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

const SearchBox = memo(function SearchBox({ onSearch }) {
  const timerRef = useRef(null);
  return (
    <div className="relative flex-1">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm">🔍</span>
      <input
        defaultValue=""
        onChange={e => {
          clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => onSearch(e.target.value), 150);
        }}
        placeholder="Search invoice #, customer…"
        className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full"
      />
    </div>
  );
});

const statusColor = { draft: 'gray', issued: 'blue', completed: 'green', void: 'red' };

export default function SaleInvoiceList() {
  const { saleInvoices, invoicesLoading } = useInvoices();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  // Multi-select chips. Empty set = "All". Within a group it's OR, across groups AND.
  const [selected, setSelected] = useState(new Set());
  const handleSearch = useCallback(v => setSearch(v), []);

  const toggleFilter = (value) => {
    if (value === 'all') { setSelected(new Set()); return; }
    setSelected(prev => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  };

  const DATE_VALS = ['today', 'last3'];
  const PAY_VALS = ['paid', 'unpaid', 'credit'];

  const filtered = [...saleInvoices]
    .filter(i => {
      const sel = [...selected];
      const dateSel   = sel.filter(v => DATE_VALS.includes(v));
      const paySel    = sel.filter(v => PAY_VALS.includes(v));
      const statusSel = sel.filter(v => !DATE_VALS.includes(v) && !PAY_VALS.includes(v));

      const dateMatch = dateSel.length === 0 || dateSel.some(v =>
        v === 'today' ? i.date === todayStr() : i.date >= nDaysAgoStr(3) && i.date <= todayStr());
      const payMatch  = paySel.length === 0 || (i.status !== 'void' && paySel.includes(payOf(i.paymentStatus)));
      const statusMatch = statusSel.length === 0 || statusSel.includes(i.status);

      const matchFilter = dateMatch && payMatch && statusMatch;
      const matchSearch = i.invoiceNumber?.toLowerCase().includes(search.toLowerCase())
                       || i.customerName?.toLowerCase().includes(search.toLowerCase());
      return matchFilter && matchSearch;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const columns = [
    { header: 'Invoice #', render: i => <span className="font-medium text-blue-600">{i.invoiceNumber}</span> },
    { header: 'Customer',  render: i => <p className="font-medium">{formatCustomerDisplay(i.customerName, i.customerPlace, i.customerType)}</p> },
    { header: 'Date',      render: i => formatDate(i.date) },
    { header: 'Amount',    align: 'right', render: i => formatCurrency(i.grandTotal) },
    { header: 'Status',    render: i => (
      <div className="flex items-center gap-1.5">
        <Badge color={statusColor[i.status]}>{statusLabel(i.status)}</Badge>
        {i.status !== 'void' && (
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${PAY[payOf(i.paymentStatus)].pill}`}>
            {PAY[payOf(i.paymentStatus)].label}
          </span>
        )}
      </div>
    ) },
    { header: '',          render: i => (
      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
        <Button size="sm" variant="ghost" onClick={() => navigate(`/sales/${i.id}/print`)}>🖨</Button>
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">Sale Invoices</h1>
        <div className="flex gap-2">
          <Link to="/sales/returns" className="hidden sm:block"><Button variant="outline">↩ Returns</Button></Link>
          <Link to="/sales/new"><Button>+ New</Button></Link>
        </div>
      </div>

      {/* Search */}
      <SearchBox onSearch={handleSearch} />

      {/* Filter chips — multi-select (tap to toggle; All clears) */}
      <div className="flex gap-1.5 flex-wrap items-center">
        {FILTERS.map(f => {
          const isActive = f.value === 'all' ? selected.size === 0 : selected.has(f.value);
          return (
            <button
              key={f.value}
              onClick={() => toggleFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                isActive ? FILTER_ACTIVE[f.value] || 'bg-gray-800 text-white border-gray-800'
                         : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {f.label}
              {f.value !== 'all' && f.value !== 'today' && f.value !== 'last3' && (() => {
                const count = PAY[f.value]
                  ? saleInvoices.filter(i => payOf(i.paymentStatus) === f.value && i.status !== 'void').length
                  : saleInvoices.filter(i => i.status === f.value).length;
                return count > 0 ? <span className="ml-1 opacity-75">({count})</span> : null;
              })()}
            </button>
          );
        })}
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-gray-600 ml-1">Clear</button>
        )}
      </div>

      {/* Mobile card list */}
      <div className="lg:hidden space-y-2">
        {invoicesLoading ? (
          <div className="text-center py-12 text-gray-400">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-3xl mb-2">🧾</p>
            <p className="font-medium">No invoices found</p>
          </div>
        ) : filtered.map(i => (
            <div
              key={i.id}
              onClick={() => navigate(`/sales/${i.id}`)}
              className="bg-white rounded-xl border border-gray-200 px-4 py-3 active:bg-gray-50 cursor-pointer shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-blue-600 text-sm">{i.invoiceNumber}</span>
                    {i.status === 'void' && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">Deleted</span>}
                    {i.status === 'draft' && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">Draft</span>}
                    {i.status === 'completed' && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">Completed</span>}
                    {i.status !== 'void' && <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${PAY[payOf(i.paymentStatus)].pill}`}>{PAY[payOf(i.paymentStatus)].label}</span>}
                  </div>
                  <p className="font-semibold text-gray-900 truncate">{i.customerName || '—'}</p>
                  {i.customerPlace && <p className="text-xs text-gray-400">{i.customerPlace}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-gray-900">{formatCurrency(i.grandTotal)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                <span className="text-xs text-gray-400">{formatDate(i.date)}</span>
              </div>
            </div>
        ))}
      </div>

      {/* Desktop table */}
      <Card padding={false} className="hidden lg:block">
        {invoicesLoading ? (
          <div className="text-center py-12 text-gray-400">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading…
          </div>
        ) : (
          <Table
            columns={columns}
            data={filtered}
            onRowClick={i => navigate(`/sales/${i.id}`)}
            emptyMsg="No invoices found. Create your first invoice!"
          />
        )}
      </Card>
    </div>
  );
}
