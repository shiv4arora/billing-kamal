import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInvoices } from '../../context/InvoiceContext';
import { Button, Table, Badge, SearchInput, Card } from '../../components/ui';
import { formatCurrency, formatDate, formatCustomerDisplay } from '../../utils/helpers';

const payColor = { paid: 'green', partial: 'yellow', unpaid: 'red' };
const statusColor = { draft: 'gray', issued: 'blue', paid: 'green', void: 'red' };

export default function SaleInvoiceList() {
  const { saleInvoices } = useInvoices();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const filtered = [...saleInvoices]
    .filter(i => {
      const matchFilter = filter === 'all' || i.status === filter || i.paymentStatus === filter;
      const matchSearch = i.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) || i.customerName?.toLowerCase().includes(search.toLowerCase());
      return matchFilter && matchSearch;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const totalRevenue = filtered.filter(i => i.status !== 'void').reduce((s, i) => s + (i.grandTotal || 0), 0);

  const columns = [
    { header: 'Invoice #', render: i => <span className="font-medium text-blue-600">{i.invoiceNumber}</span> },
    { header: 'Customer', render: i => <p className="font-medium">{formatCustomerDisplay(i.customerName, i.customerPlace, i.customerType)}</p> },
    { header: 'Date', render: i => formatDate(i.date) },
    { header: 'Amount', align: 'right', render: i => formatCurrency(i.grandTotal) },
    { header: 'Status', render: i => <Badge color={statusColor[i.status]}>{i.status}</Badge> },
    { header: 'Payment', render: i => <Badge color={payColor[i.paymentStatus]}>{i.paymentStatus}</Badge> },
    { header: '', render: i => (
      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
        <Button size="sm" variant="ghost" onClick={() => navigate(`/sales/${i.id}/print`)}>🖨</Button>
      </div>
    )},
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sale Invoices</h1>
        <Link to="/sales/new"><Button>+ New Invoice</Button></Link>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-xl p-4"><p className="text-xs text-blue-500 font-medium">Total ({filtered.length})</p><p className="text-xl font-bold text-blue-900">{formatCurrency(totalRevenue)}</p></div>
        <div className="bg-yellow-50 rounded-xl p-4"><p className="text-xs text-yellow-500 font-medium">Unpaid</p><p className="text-xl font-bold text-yellow-900">{formatCurrency(filtered.filter(i => i.paymentStatus === 'unpaid' && i.status !== 'void').reduce((s,i) => s + (i.grandTotal||0), 0))}</p></div>
        <div className="bg-green-50 rounded-xl p-4"><p className="text-xs text-green-500 font-medium">Paid</p><p className="text-xl font-bold text-green-900">{formatCurrency(filtered.filter(i => i.paymentStatus === 'paid').reduce((s,i) => s + (i.grandTotal||0), 0))}</p></div>
      </div>
      <Card padding={false}>
        <div className="p-4 border-b flex gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search invoice, customer…" />
          <select value={filter} onChange={e => setFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="void">Void</option>
          </select>
        </div>
        <Table columns={columns} data={filtered} onRowClick={i => navigate(`/sales/${i.id}`)} emptyMsg="No invoices found. Create your first invoice!" />
      </Card>
    </div>
  );
}
