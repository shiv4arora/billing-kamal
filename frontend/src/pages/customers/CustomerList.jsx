import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCustomers } from '../../context/CustomerContext';
import { useLedger } from '../../context/LedgerContext';
import { Button, Table, Badge, SearchInput, ConfirmDialog, Card } from '../../components/ui';
import { formatCurrency } from '../../utils/helpers';

const typeColor = { wholesale: 'blue', shop: 'purple' };

export default function CustomerList() {
  const { active, remove } = useCustomers();
  const { getBalance } = useLedger();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');

  const filtered = active.filter(c => {
    const matchType = typeFilter === 'all' || c.type === typeFilter;
    const matchSearch =
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.place?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search);
    return matchType && matchSearch;
  });

  const columns = [
    {
      header: 'Name',
      render: c => (
        <div>
          <p className="font-semibold text-gray-900">{c.name}</p>
          {c.email && <p className="text-xs text-gray-400">{c.email}</p>}
        </div>
      ),
    },
    {
      header: 'Place',
      render: c => (
        <span className="text-gray-700">{c.place || <span className="text-gray-300 italic">—</span>}</span>
      ),
    },
    {
      header: 'Contact Number',
      render: c => (
        <a href={`tel:${c.phone}`} className="font-medium text-blue-600 hover:underline" onClick={e => e.stopPropagation()}>
          {c.phone || <span className="text-gray-300 italic">—</span>}
        </a>
      ),
    },
    {
      header: 'Type',
      render: c => <Badge color={typeColor[c.type] || 'gray'}>{c.type}</Badge>,
    },
    {
      header: 'Balance',
      align: 'right',
      render: c => {
        const bal = getBalance('customer', c.id);
        return bal > 0.01
          ? <span className="text-red-600 font-semibold text-sm">{formatCurrency(bal)} <span className="text-xs">Dr</span></span>
          : bal < -0.01
          ? <span className="text-purple-600 font-semibold text-sm">{formatCurrency(Math.abs(bal))} <span className="text-xs">Cr</span></span>
          : <span className="text-gray-400 text-sm">Settled</span>;
      },
    },
    {
      header: '',
      render: c => (
        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/customers/${c.id}/ledger`)}>📒 Ledger</Button>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/customers/${c.id}/edit`)}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(c.id)}>🗑</Button>
        </div>
      ),
    },
  ];

  const wholesale = active.filter(c => c.type === 'wholesale').length;
  const shop = active.filter(c => c.type === 'shop').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Customer Database</h1>
        <Link to="/customers/new"><Button>+ Add Customer</Button></Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{active.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Customers</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{wholesale}</p>
          <p className="text-xs text-blue-500 mt-0.5">Wholesale</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-purple-700">{shop}</p>
          <p className="text-xs text-purple-500 mt-0.5">Shop</p>
        </div>
      </div>

      <Card padding={false}>
        <div className="p-4 border-b border-gray-100 flex gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, place or phone…" />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="all">All Types</option>
            <option value="wholesale">Wholesale</option>
            <option value="shop">Shop</option>
          </select>
        </div>
        <Table columns={columns} data={filtered} onRowClick={c => navigate(`/customers/${c.id}/ledger`)} emptyMsg="No customers found. Add your first customer!" />
        {filtered.length > 0 && (
          <div className="px-4 py-2 border-t text-xs text-gray-400">
            Showing {filtered.length} of {active.length} customers
          </div>
        )}
      </Card>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => remove(confirm)} title="Delete Customer" message="Are you sure you want to delete this customer?" />
    </div>
  );
}
