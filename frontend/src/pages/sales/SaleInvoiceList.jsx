import { useState, useRef, useCallback, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInvoices } from '../../context/InvoiceContext';
import { Button, Table, Badge, Card } from '../../components/ui';
import { formatCurrency, formatDate, formatCustomerDisplay } from '../../utils/helpers';

const FILTERS = [
  { label: 'All',        value: 'all' },
  { label: 'Today',      value: 'today' },
  { label: 'Last 3 Days',value: 'last3' },
  { label: 'Draft',      value: 'draft' },
  { label: 'Issued',     value: 'issued' },
  { label: 'Unpaid',     value: 'unpaid' },
  { label: 'Partial',    value: 'partial' },
  { label: 'Paid',       value: 'paid' },
  { label: 'Completed',  value: 'completed' },
  { label: 'Void',       value: 'void' },
];

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

const payColor   = { paid: 'green', partial: 'yellow', unpaid: 'red' };
const statusColor = { draft: 'gray', issued: 'blue', paid: 'green', completed: 'green', void: 'red' };

const payBg = {
  paid:    'bg-green-100 text-green-700',
  partial: 'bg-yellow-100 text-yellow-700',
  unpaid:  'bg-red-100 text-red-700',
};

export default function SaleInvoiceList() {
  const { saleInvoices, invoicesLoading } = useInvoices();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const handleSearch = useCallback(v => setSearch(v), []);

  const filtered = [...saleInvoices]
    .filter(i => {
      const matchFilter =
        filter === 'all'   ? true :
        filter === 'today' ? i.date === todayStr() :
        filter === 'last3' ? i.date >= nDaysAgoStr(3) && i.date <= todayStr() :
        i.status === filter || i.paymentStatus === filter;
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
    { header: 'Status',    render: i => <Badge color={statusColor[i.status]}>{i.status}</Badge> },
    { header: 'Payment',   render: i => <Badge color={payColor[i.paymentStatus]}>{i.paymentStatus}</Badge> },
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

      {/* Filter buttons */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              filter === f.value
                ? f.value === 'void'      ? 'bg-red-600 text-white border-red-600'
                : f.value === 'draft'     ? 'bg-gray-600 text-white border-gray-600'
                : f.value === 'unpaid'    ? 'bg-red-500 text-white border-red-500'
                : f.value === 'partial'   ? 'bg-yellow-500 text-white border-yellow-500'
                : f.value === 'paid'      ? 'bg-green-600 text-white border-green-600'
                : f.value === 'completed' ? 'bg-emerald-600 text-white border-emerald-600'
                : f.value === 'issued'    ? 'bg-blue-600 text-white border-blue-600'
                : f.value === 'today'     ? 'bg-purple-600 text-white border-purple-600'
                : f.value === 'last3'     ? 'bg-indigo-600 text-white border-indigo-600'
                :                          'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            {f.label}
            {f.value !== 'all' && f.value !== 'today' && f.value !== 'last3' && (() => {
              const count = saleInvoices.filter(i =>
                i.status === f.value || i.paymentStatus === f.value
              ).length;
              return count > 0 ? <span className="ml-1 opacity-75">({count})</span> : null;
            })()}
          </button>
        ))}
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
        ) : filtered.map(i => {
          const balance = (i.grandTotal || 0) - (i.amountPaid || 0);
          return (
            <div
              key={i.id}
              onClick={() => navigate(`/sales/${i.id}`)}
              className="bg-white rounded-xl border border-gray-200 px-4 py-3 active:bg-gray-50 cursor-pointer shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-blue-600 text-sm">{i.invoiceNumber}</span>
                    {i.status === 'void' && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">Void</span>}
                    {i.status === 'draft' && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">Draft</span>}
                  </div>
                  <p className="font-semibold text-gray-900 truncate">{i.customerName || '—'}</p>
                  {i.customerPlace && <p className="text-xs text-gray-400">{i.customerPlace}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-gray-900">{formatCurrency(i.grandTotal)}</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${payBg[i.paymentStatus] || 'bg-gray-100 text-gray-500'}`}>
                    {i.paymentStatus}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                <span className="text-xs text-gray-400">{formatDate(i.date)}</span>
                {balance > 0.01 && i.status !== 'void' && (
                  <span className="text-xs font-medium text-red-600">Due: {formatCurrency(balance)}</span>
                )}
                {balance <= 0.01 && i.paymentStatus === 'paid' && (
                  <span className="text-xs font-medium text-green-600">✓ Paid</span>
                )}
              </div>
            </div>
          );
        })}
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
