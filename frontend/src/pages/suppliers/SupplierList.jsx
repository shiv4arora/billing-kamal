import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSuppliers } from '../../context/SupplierContext';
import { useLedger } from '../../context/LedgerContext';
import { Button, Table, SearchInput, ConfirmDialog, Card } from '../../components/ui';
import { formatCurrency } from '../../utils/helpers';

export default function SupplierList() {
  const { active, remove } = useSuppliers();
  const { getBalance } = useLedger();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(null);

  const filtered = active.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.code?.toLowerCase().includes(search.toLowerCase()) ||
    s.place?.toLowerCase().includes(search.toLowerCase()) ||
    s.phone?.includes(search) ||
    s.contactPerson?.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    {
      header: 'Name',
      render: s => (
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900">{s.name}</p>
            {s.code && <span className="text-xs bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded font-mono">{s.code}</span>}
          </div>
          {s.contactPerson && <p className="text-xs text-gray-400">{s.contactPerson}</p>}
        </div>
      ),
    },
    {
      header: 'Place',
      render: s => (
        <span className="text-gray-700">{s.place || <span className="text-gray-300 italic">—</span>}</span>
      ),
    },
    {
      header: 'Contact Number',
      render: s => (
        <a href={`tel:${s.phone}`} className="font-medium text-green-600 hover:underline" onClick={e => e.stopPropagation()}>
          {s.phone || <span className="text-gray-300 italic">—</span>}
        </a>
      ),
    },
    {
      header: 'GSTIN',
      render: s => s.gstin || <span className="text-gray-300 italic">—</span>,
    },
    {
      header: 'Balance',
      align: 'right',
      render: s => {
        const bal = getBalance('supplier', s.id);
        return bal > 0.01
          ? <span className="text-red-600 font-semibold text-sm">{formatCurrency(bal)} <span className="text-xs">Cr</span></span>
          : bal < -0.01
          ? <span className="text-purple-600 font-semibold text-sm">{formatCurrency(Math.abs(bal))} <span className="text-xs">Dr</span></span>
          : <span className="text-gray-400 text-sm">Settled</span>;
      },
    },
    {
      header: '',
      render: s => (
        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/suppliers/${s.id}/ledger`)}>📗 Ledger</Button>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/suppliers/${s.id}/edit`)}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(s.id)}>🗑</Button>
        </div>
      ),
    },
  ];

  // Group by place for the stats
  const places = [...new Set(active.map(s => s.place).filter(Boolean))].length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Supplier Database</h1>
        <Link to="/suppliers/new"><Button variant="success">+ Add Supplier</Button></Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{active.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total Suppliers</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{places}</p>
          <p className="text-xs text-green-500 mt-0.5">Locations</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{active.filter(s => s.gstin).length}</p>
          <p className="text-xs text-blue-500 mt-0.5">GST Registered</p>
        </div>
      </div>

      <Card padding={false}>
        <div className="p-4 border-b">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, place, contact person or phone…" />
        </div>
        <Table columns={columns} data={filtered} onRowClick={s => navigate(`/suppliers/${s.id}/ledger`)} emptyMsg="No suppliers found. Add your first supplier!" />
        {filtered.length > 0 && (
          <div className="px-4 py-2 border-t text-xs text-gray-400">
            Showing {filtered.length} of {active.length} suppliers
          </div>
        )}
      </Card>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => remove(confirm)} title="Delete Supplier" message="Are you sure you want to delete this supplier?" />
    </div>
  );
}
