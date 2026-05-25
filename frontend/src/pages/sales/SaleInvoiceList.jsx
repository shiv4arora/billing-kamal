import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInvoices } from '../../context/InvoiceContext';
import { Button, Table, Badge, SearchInput, Card } from '../../components/ui';
import { formatCurrency, formatDate, formatCustomerDisplay } from '../../utils/helpers';

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

  const filtered = [...saleInvoices]
    .filter(i => {
      const matchFilter = filter === 'all' || i.status === filter || i.paymentStatus === filter;
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

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="Search invoice, customer…" />
        </div>
        <select
          value={filter} onChange={e => setFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-2 text-sm bg-white"
        >
          <option value="all">All</option>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="void">Void</option>
        </select>
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
