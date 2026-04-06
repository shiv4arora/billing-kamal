import { useState } from 'react';
import { useProducts } from '../context/ProductContext';
import { useInvoices } from '../context/InvoiceContext';
import { useSettings } from '../context/SettingsContext';
import { Button, Table, Badge, SearchInput, Card, Modal, Input, useToast, Toast } from '../components/ui';
import { formatDate } from '../utils/helpers';

export default function Inventory() {
  const { active: products, updateStock } = useProducts();
  const { stockLedger, addStockEntry } = useInvoices();
  const { settings } = useSettings();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [filterLow, setFilterLow] = useState(false);
  const [adjModal, setAdjModal] = useState(null);
  const [adjQty, setAdjQty] = useState('');
  const [adjNotes, setAdjNotes] = useState('');
  const [ledgerModal, setLedgerModal] = useState(null);

  const filtered = products.filter(p => {
    const matchSearch = p.name?.toLowerCase().includes(search.toLowerCase()) || p.category?.toLowerCase().includes(search.toLowerCase());
    const matchLow = !filterLow || (p.currentStock || 0) <= (p.lowStockThreshold ?? settings.lowStockThreshold);
    return matchSearch && matchLow;
  });

  const handleAdjust = () => {
    if (!adjQty) { toast.error('Enter quantity'); return; }
    const qty = +adjQty;
    updateStock(adjModal.id, qty);
    addStockEntry({ productId: adjModal.id, date: new Date().toISOString().slice(0,10), movementType: 'adjustment', quantity: qty, notes: adjNotes });
    toast.success(`Stock adjusted: ${qty > 0 ? '+' : ''}${qty} ${adjModal.unit}`);
    setAdjModal(null); setAdjQty(''); setAdjNotes('');
  };

  const productLedger = ledgerModal ? stockLedger.filter(e => e.productId === ledgerModal.id).sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)) : [];

  const columns = [
    { header: 'Product', render: p => <div><p className="font-medium text-gray-900">{p.name}</p><p className="text-xs text-gray-400">{p.category} · {p.sku}</p></div> },
    { header: 'Unit', key: 'unit' },
    { header: 'Stock', align: 'right', render: p => {
      const low = (p.currentStock || 0) <= (p.lowStockThreshold ?? settings.lowStockThreshold);
      return <span className={`font-bold text-lg ${low ? 'text-red-600' : p.currentStock > (p.lowStockThreshold ?? settings.lowStockThreshold) * 3 ? 'text-green-600' : 'text-yellow-600'}`}>{p.currentStock || 0}</span>;
    }},
    { header: 'Threshold', align: 'right', render: p => p.lowStockThreshold ?? settings.lowStockThreshold },
    { header: 'Status', render: p => {
      const stock = p.currentStock || 0;
      const thresh = p.lowStockThreshold ?? settings.lowStockThreshold;
      if (stock <= 0) return <Badge color="red">Out of Stock</Badge>;
      if (stock <= thresh) return <Badge color="orange">Low Stock</Badge>;
      return <Badge color="green">In Stock</Badge>;
    }},
    { header: '', render: p => (
      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
        <Button size="sm" variant="secondary" onClick={() => { setAdjModal(p); setAdjQty(''); setAdjNotes(''); }}>Adjust</Button>
        <Button size="sm" variant="ghost" onClick={() => setLedgerModal(p)}>History</Button>
      </div>
    )},
  ];

  const lowCount = products.filter(p => (p.currentStock||0) <= (p.lowStockThreshold ?? settings.lowStockThreshold)).length;

  return (
    <>
      <Toast toasts={toast.toasts} remove={toast.remove} />
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          {lowCount > 0 && <Badge color="red">{lowCount} items low/out of stock</Badge>}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-xl p-4"><p className="text-xs text-green-500 font-medium">In Stock</p><p className="text-2xl font-bold text-green-900">{products.filter(p => (p.currentStock||0) > (p.lowStockThreshold ?? settings.lowStockThreshold)).length}</p></div>
          <div className="bg-yellow-50 rounded-xl p-4"><p className="text-xs text-yellow-500 font-medium">Low Stock</p><p className="text-2xl font-bold text-yellow-900">{products.filter(p => { const s=p.currentStock||0; const t=p.lowStockThreshold??settings.lowStockThreshold; return s>0&&s<=t; }).length}</p></div>
          <div className="bg-red-50 rounded-xl p-4"><p className="text-xs text-red-500 font-medium">Out of Stock</p><p className="text-2xl font-bold text-red-900">{products.filter(p => (p.currentStock||0) <= 0).length}</p></div>
        </div>
        <Card padding={false}>
          <div className="p-4 border-b flex gap-3 items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Search products…" />
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={filterLow} onChange={e => setFilterLow(e.target.checked)} className="rounded" /> Low stock only
            </label>
          </div>
          <Table columns={columns} data={filtered} emptyMsg="No products found." />
        </Card>
      </div>

      {/* Adjustment Modal */}
      <Modal open={!!adjModal} onClose={() => setAdjModal(null)} title={`Adjust Stock: ${adjModal?.name}`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Current stock: <span className="font-bold text-gray-800">{adjModal?.currentStock || 0} {adjModal?.unit}</span></p>
          <Input label="Quantity Change (use negative to deduct)" type="number" value={adjQty} onChange={e => setAdjQty(e.target.value)} placeholder="e.g. 50 or -10" />
          <Input label="Notes (optional)" value={adjNotes} onChange={e => setAdjNotes(e.target.value)} placeholder="Reason for adjustment" />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setAdjModal(null)}>Cancel</Button>
            <Button onClick={handleAdjust}>Apply Adjustment</Button>
          </div>
        </div>
      </Modal>

      {/* Ledger Modal */}
      <Modal open={!!ledgerModal} onClose={() => setLedgerModal(null)} title={`Stock History: ${ledgerModal?.name}`} size="lg">
        {productLedger.length === 0 ? <p className="text-center py-8 text-gray-400">No stock movements recorded.</p> : (
          <div className="space-y-1">
            {productLedger.map(e => (
              <div key={e.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                <div>
                  <p className="font-medium capitalize">{e.movementType}</p>
                  <p className="text-xs text-gray-400">{e.referenceNo || ''} {e.notes || ''}</p>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${e.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>{e.quantity > 0 ? '+' : ''}{e.quantity}</p>
                  <p className="text-xs text-gray-400">{formatDate(e.date)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
