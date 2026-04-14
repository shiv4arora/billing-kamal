import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { useSuppliers } from '../../context/SupplierContext';
import { Button, Table, SearchInput, ConfirmDialog, Card, Modal } from '../../components/ui';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { api } from '../../hooks/useApi';

export default function ProductList() {
  const { active, remove } = useProducts();
  const { suppliers } = useSuppliers();
  const navigate = useNavigate();
  const [search, setSearch]   = useState('');
  const [confirm, setConfirm] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [skuModal, setSkuModal]   = useState(null);
  const [skuHistory, setSkuHistory] = useState(null);
  const [skuLoading, setSkuLoading] = useState(false);
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterStock, setFilterStock] = useState('');   // '' | 'low' | 'out'
  const [sortKey, setSortKey] = useState('name');       // 'name'|'stock'|'wholesale'|'shop'
  const [sortDir, setSortDir] = useState('asc');        // 'asc'|'desc'
  const [showFilters, setShowFilters] = useState(false);

  const openSkuModal = async (p, e) => {
    e.stopPropagation();
    setSkuModal(p);
    setSkuHistory(null);
    setSkuLoading(true);
    try {
      const data = await api(`/products/${p.id}/history`);
      setSkuHistory(data);
    } catch { /* ignore */ }
    setSkuLoading(false);
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortArrow = ({ col }) => (
    <span className={`ml-1 text-[10px] ${sortKey === col ? 'text-blue-600' : 'text-gray-300'}`}>
      {sortKey === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  );

  const filtered = active
    .filter(p =>
      (p.name?.toLowerCase().includes(search.toLowerCase()) ||
       p.sku?.toLowerCase().includes(search.toLowerCase())) &&
      (!filterSupplier || p.supplierId === filterSupplier) &&
      (filterStock === 'out' ? (p.currentStock || 0) === 0
       : filterStock === 'low' ? (p.currentStock || 0) > 0 && (p.currentStock || 0) <= (p.lowStockThreshold || 10)
       : true)
    )
    .sort((a, b) => {
      let va, vb;
      if (sortKey === 'name')      { va = a.name?.toLowerCase() || ''; vb = b.name?.toLowerCase() || ''; }
      else if (sortKey === 'stock') { va = a.currentStock || 0;         vb = b.currentStock || 0; }
      else if (sortKey === 'wholesale') { va = a.pricing?.wholesale || 0; vb = b.pricing?.wholesale || 0; }
      else if (sortKey === 'shop')      { va = a.pricing?.shop || 0;      vb = b.pricing?.shop || 0; }
      else { va = a.name?.toLowerCase() || ''; vb = b.name?.toLowerCase() || ''; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const activeFilters = [filterSupplier, filterStock].filter(Boolean).length;

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
      header: <button onClick={() => toggleSort('name')} className="flex items-center font-semibold text-gray-500 text-xs uppercase tracking-wide hover:text-blue-600">Product <SortArrow col="name" /></button>,
      render: p => (
        <div>
          <p className="font-medium text-gray-900">{p.name}</p>
          <button
            onClick={e => openSkuModal(p, e)}
            className="text-xs text-blue-500 font-mono hover:underline hover:text-blue-700 mt-0.5 text-left"
            title="View SKU history"
          >
            {p.sku ? `SKU: ${p.sku}` : 'No SKU'} · {p.unit}
          </button>
        </div>
      )
    },
    { header: 'Vendor', render: p => {
      const s = suppliers.find(s => s.id === p.supplierId);
      return s
        ? <div><p className="text-sm font-medium text-gray-800">{s.name}</p>{s.phone && <p className="text-xs text-gray-400">{s.phone}</p>}</div>
        : <span className="text-xs text-gray-300">—</span>;
    }},
    {
      header: <button onClick={() => toggleSort('wholesale')} className="flex items-center font-semibold text-gray-500 text-xs uppercase tracking-wide hover:text-blue-600 ml-auto">Wholesale <SortArrow col="wholesale" /></button>,
      align: 'right', render: p => formatCurrency(p.pricing?.wholesale || 0)
    },
    {
      header: <button onClick={() => toggleSort('shop')} className="flex items-center font-semibold text-gray-500 text-xs uppercase tracking-wide hover:text-blue-600 ml-auto">Shop <SortArrow col="shop" /></button>,
      align: 'right', render: p => formatCurrency(p.pricing?.shop || 0)
    },
    {
      header: <button onClick={() => toggleSort('stock')} className="flex items-center font-semibold text-gray-500 text-xs uppercase tracking-wide hover:text-blue-600 ml-auto">Stock <SortArrow col="stock" /></button>,
      align: 'right', render: p => (
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
      <div className="flex items-center justify-between flex-wrap gap-2">
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
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center gap-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Search by name, SKU ID, category…" />
            <button
              onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${showFilters || activeFilters > 0 ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}
            >
              ⚙ Filters {activeFilters > 0 && <span className="bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{activeFilters}</span>}
              <span>{showFilters ? '▲' : '▼'}</span>
            </button>
            {someSelected && (
              <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap">
                Clear ({selected.size})
              </button>
            )}
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="flex flex-wrap gap-3 pt-1">
              <select
                value={filterSupplier}
                onChange={e => setFilterSupplier(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">All Suppliers</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

<select
                value={filterStock}
                onChange={e => setFilterStock(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">All Stock</option>
                <option value="low">Low Stock</option>
                <option value="out">Out of Stock</option>
              </select>

              {activeFilters > 0 && (
                <button
                  onClick={() => { setFilterSupplier(''); setFilterStock(''); }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 border border-red-200 rounded-lg hover:bg-red-50"
                >
                  ✕ Clear filters
                </button>
              )}

              <span className="text-xs text-gray-400 self-center">{filtered.length} of {active.length} products</span>
            </div>
          )}
        </div>
        <Table columns={columns} data={filtered} onRowClick={p => navigate(`/products/${p.id}/edit`)} emptyMsg="No products found. Add your first product!" />
      </Card>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => remove(confirm)} title="Delete Product" message="Are you sure you want to delete this product?" />

      {/* SKU History Modal */}
      <Modal open={!!skuModal} onClose={() => { setSkuModal(null); setSkuHistory(null); }} title={`SKU History — ${skuModal?.name}`} size="lg">
        {skuLoading ? (
          <p className="text-center py-8 text-gray-400">Loading…</p>
        ) : skuHistory ? (
          <div className="space-y-4">
            {/* Product info */}
            <div className="grid grid-cols-3 gap-3 text-sm bg-gray-50 rounded-xl p-4">
              <div><p className="text-xs text-gray-500 uppercase mb-1">SKU ID</p><p className="font-mono font-bold text-blue-700">{skuHistory.product.sku || '—'}</p></div>
              <div><p className="text-xs text-gray-500 uppercase mb-1">Created</p><p className="font-medium">{formatDate(skuHistory.product.createdAt)}</p></div>
              <div><p className="text-xs text-gray-500 uppercase mb-1">Current Stock</p><p className="font-bold">{skuHistory.product.currentStock ?? 0} {skuHistory.product.unit}</p></div>
            </div>

            {/* Movements */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Invoice History</p>
              {skuHistory.movements.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No invoice history yet.</p>
              ) : (
                <div className="divide-y border rounded-xl overflow-hidden">
                  {skuHistory.movements.map((m, i) => {
                    const isIn  = m.quantity > 0;
                    const isPurchase = m.movementType === 'purchase';
                    const isSale     = m.movementType === 'sale';
                    return (
                      <div key={i} className={`flex items-center justify-between px-4 py-3 text-sm ${i === 0 ? 'bg-blue-50' : 'bg-white'}`}>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isIn ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {isIn ? '▲ IN' : '▼ OUT'}
                          </span>
                          <div>
                            <p className="font-medium capitalize text-gray-800">
                              {m.movementType}
                              {i === 0 && isPurchase && <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">First Purchase (SKU Created)</span>}
                            </p>
                            {m.referenceNo && (
                              isPurchase ? (
                                <Link to={`/purchases/${m.referenceId}`} onClick={() => setSkuModal(null)} className="text-xs text-blue-500 hover:underline font-mono">
                                  {m.referenceNo}
                                </Link>
                              ) : isSale ? (
                                <Link to={`/sales/${m.referenceId}`} onClick={() => setSkuModal(null)} className="text-xs text-purple-500 hover:underline font-mono">
                                  {m.referenceNo}
                                </Link>
                              ) : (
                                <span className="text-xs text-gray-400 font-mono">{m.referenceNo}</span>
                              )
                            )}
                            {m.notes && <p className="text-xs text-gray-400">{m.notes}</p>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${isIn ? 'text-green-600' : 'text-red-600'}`}>{isIn ? '+' : ''}{m.quantity}</p>
                          <p className="text-xs text-gray-400">{formatDate(m.date)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
