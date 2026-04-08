import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { Button, Table, SearchInput, ConfirmDialog, Card } from '../../components/ui';
import { formatCurrency } from '../../utils/helpers';

export default function ProductList() {
  const { active, remove } = useProducts();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const filtered = active.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.toLowerCase().includes(search.toLowerCase())
  );

  const allSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id));
  const someSelected = selected.size > 0;

  const toggleOne = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(p => next.delete(p.id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(p => next.add(p.id));
        return next;
      });
    }
  };

  const printSelected = () => {
    const selectedProducts = active.filter(p => selected.has(p.id));
    navigate('/labels/bulk', {
      state: {
        items: selectedProducts.map(p => ({ product: p, qty: 1, supplier: null })),
      },
    });
  };

  const columns = [
    {
      header: (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
          title={allSelected ? 'Deselect all' : 'Select all'}
        />
      ),
      render: p => (
        <div onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected.has(p.id)}
            onChange={() => toggleOne(p.id)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
          />
        </div>
      ),
    },
    {
      header: 'Product', render: p => (
        <div>
          <p className="font-medium text-gray-900">{p.name}</p>
          <p className="text-xs text-gray-400 font-mono">{p.sku} · {p.unit}</p>
        </div>
      )
    },
    { header: 'Category', key: 'category' },
    { header: 'Wholesale', align: 'right', render: p => formatCurrency(p.pricing?.wholesale || 0) },
    { header: 'Shop', align: 'right', render: p => formatCurrency(p.pricing?.shop || 0) },
    {
      header: 'Stock', align: 'right', render: p => (
        <span className={`font-medium ${(p.currentStock || 0) <= (p.lowStockThreshold || 10) ? 'text-red-600' : 'text-gray-700'}`}>
          {p.currentStock || 0} {p.unit}
        </span>
      )
    },
    { header: 'GST', align: 'right', render: p => `${p.gstRate || 0}%` },
    {
      header: '', render: p => (
        <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => navigate(`/products/${p.id}/label`)}
            title="Print barcode label"
            className="px-2 py-1 text-xs font-medium border border-gray-200 rounded hover:bg-gray-50 hover:border-blue-300 hover:text-blue-600 transition-colors"
          >
            🏷 Label
          </button>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/products/${p.id}/edit`)}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(p.id)}>🗑</Button>
        </div>
      )
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        <div className="flex items-center gap-2">
          {someSelected && (
            <button
              onClick={printSelected}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
            >
              🏷 Print Labels ({selected.size})
            </button>
          )}
          <Link to="/products/new"><Button>+ Add Product</Button></Link>
        </div>
      </div>
      <Card padding={false}>
        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, SKU ID, category…" />
          {someSelected && (
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap"
            >
              Clear ({selected.size})
            </button>
          )}
        </div>
        <Table columns={columns} data={filtered} onRowClick={p => navigate(`/products/${p.id}/edit`)} emptyMsg="No products found. Add your first product!" />
      </Card>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => remove(confirm)} title="Delete Product" message="Are you sure you want to delete this product?" />
    </div>
  );
}
