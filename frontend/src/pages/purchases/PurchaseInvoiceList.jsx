import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInvoices } from '../../context/InvoiceContext';
import { useSuppliers } from '../../context/SupplierContext';
import { Button, Table, Badge, SearchInput, Card } from '../../components/ui';
import { formatCurrency, formatDate } from '../../utils/helpers';

const payColor = { paid: 'green', partial: 'yellow', unpaid: 'red' };
const statusColor = { draft: 'gray', issued: 'blue', paid: 'green', void: 'red' };

export default function PurchaseInvoiceList() {
  const { purchaseInvoices } = useInvoices();
  const { get: getSupplier } = useSuppliers();
  const navigate = useNavigate();

  const supplierLabel = (inv) => {
    const s = getSupplier(inv.supplierId);
    const code = s ? (s.code || s.name.replace(/\s+/g,'').slice(0,4).toUpperCase()) : null;
    return code ? `${inv.supplierName} (${code})` : inv.supplierName;
  };
  const [search, setSearch] = useState('');

  const filtered = [...purchaseInvoices]
    .filter(i => i.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) || i.supplierName?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const columns = [
    { header: 'Invoice #', render: i => <span className="font-medium text-green-700">{i.invoiceNumber}</span> },
    { header: 'Supplier', render: i => <div><p className="font-medium">{supplierLabel(i)}</p>{i.supplierInvoiceNumber && <p className="text-xs text-gray-400">Ref: {i.supplierInvoiceNumber}</p>}</div> },
    { header: 'Date', render: i => formatDate(i.date) },
    { header: 'Amount', align: 'right', render: i => formatCurrency(i.grandTotal) },
    { header: 'Status', render: i => <Badge color={statusColor[i.status]}>{i.status}</Badge> },
    { header: 'Payment', render: i => <Badge color={payColor[i.paymentStatus]}>{i.paymentStatus}</Badge> },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Purchase Invoices</h1>
        <Link to="/purchases/new"><Button variant="success">+ New Purchase</Button></Link>
      </div>
      <Card padding={false}>
        <div className="p-4 border-b"><SearchInput value={search} onChange={setSearch} placeholder="Search purchases…" /></div>
        <Table columns={columns} data={filtered} onRowClick={i => navigate(`/purchases/${i.id}`)} emptyMsg="No purchase invoices yet." />
      </Card>
    </div>
  );
}
