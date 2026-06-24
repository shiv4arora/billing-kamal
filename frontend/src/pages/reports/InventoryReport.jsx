import { useState, useMemo, useRef, useCallback, memo } from 'react';
import { useProducts } from '../../context/ProductContext';
import { useSuppliers } from '../../context/SupplierContext';
import { useSettings } from '../../context/SettingsContext';
import { Card, Button, Badge } from '../../components/ui';
import { formatCurrency, exportToCSV } from '../../utils/helpers';

// Lag-free uncontrolled search (debounced) — same pattern as the product list
const SearchBox = memo(function SearchBox({ onSearch }) {
  const timerRef = useRef(null);
  return (
    <div className="relative flex-1 min-w-[200px]">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm">🔍</span>
      <input
        defaultValue=""
        onChange={e => { clearTimeout(timerRef.current); timerRef.current = setTimeout(() => onSearch(e.target.value), 150); }}
        placeholder="Search product or SKU…"
        className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full"
      />
    </div>
  );
});

const STATUS = {
  in:  { label: 'In Stock',     color: 'green',  chip: 'bg-green-600 text-white border-green-600' },
  low: { label: 'Low Stock',    color: 'orange', chip: 'bg-orange-500 text-white border-orange-500' },
  out: { label: 'Out of Stock', color: 'red',    chip: 'bg-red-500 text-white border-red-500' },
};
const CAP = 150;

export default function InventoryReport() {
  const { active: products } = useProducts();
  const { active: suppliers } = useSuppliers();
  const { settings } = useSettings();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | in | low | out
  const [vendorFilter, setVendorFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortKey, setSortKey] = useState('costvalue'); // name | stock | costvalue | wsvalue
  const [sortDir, setSortDir] = useState('desc');
  const handleSearch = useCallback(v => setSearch(v), []);

  const supplierName = useMemo(() => {
    const m = {}; suppliers.forEach(s => { m[s.id] = s.name; }); return m;
  }, [suppliers]);

  const enriched = useMemo(() => {
    const thr = settings.lowStockThreshold ?? 10;
    return products.map(p => {
      const stock = p.currentStock || 0;
      const cost = p.costPrice || 0;
      const wholesale = p.pricing?.wholesale || 0;
      const t = p.lowStockThreshold ?? thr;
      const status = stock <= 0 ? 'out' : stock <= t ? 'low' : 'in';
      return {
        ...p, stock, cost, wholesale,
        costValue: stock * cost,
        wsValue: stock * wholesale,
        status,
        vendor: p.supplierId ? (supplierName[p.supplierId] || 'Unknown') : '—',
      };
    });
  }, [products, supplierName, settings]);

  const categories = useMemo(() => [...new Set(products.map(p => p.category).filter(Boolean))].sort(), [products]);

  const counts = useMemo(() => ({
    all: enriched.length,
    in:  enriched.filter(p => p.status === 'in').length,
    low: enriched.filter(p => p.status === 'low').length,
    out: enriched.filter(p => p.status === 'out').length,
  }), [enriched]);

  const stats = useMemo(() => ({
    units:     enriched.reduce((s, p) => s + p.stock, 0),
    costValue: enriched.reduce((s, p) => s + p.costValue, 0),
    wsValue:   enriched.reduce((s, p) => s + p.wsValue, 0),
  }), [enriched]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = enriched.filter(p =>
      (!q || p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)) &&
      (statusFilter === 'all' || p.status === statusFilter) &&
      (!vendorFilter || p.supplierId === vendorFilter) &&
      (!categoryFilter || p.category === categoryFilter)
    );
    return list.sort((a, b) => {
      let va, vb;
      if (sortKey === 'name')        { va = a.name?.toLowerCase() || ''; vb = b.name?.toLowerCase() || ''; }
      else if (sortKey === 'stock')  { va = a.stock; vb = b.stock; }
      else if (sortKey === 'wsvalue'){ va = a.wsValue; vb = b.wsValue; }
      else                           { va = a.costValue; vb = b.costValue; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [enriched, search, statusFilter, vendorFilter, categoryFilter, sortKey, sortDir]);

  // Stock value grouped by vendor (all vendors)
  const byVendor = useMemo(() => {
    const m = {};
    enriched.forEach(p => {
      const k = p.supplierId || '__none__';
      if (!m[k]) m[k] = { name: p.supplierId ? p.vendor : '— No Vendor —', costValue: 0, wsValue: 0, units: 0, count: 0 };
      m[k].costValue += p.costValue; m[k].wsValue += p.wsValue; m[k].units += p.stock; m[k].count += 1;
    });
    // % share is based on wholesale value — cost is ₹0 for produced goods, so a
    // cost basis would show 0% for most stock and never total 100%.
    const rows = Object.values(m);
    const total = rows.reduce((s, v) => s + v.wsValue, 0);
    rows.forEach(v => { v.pct = total > 0 ? (v.wsValue / total) * 100 : 0; });

    // Round each % to 1 decimal so the column sums to EXACTLY 100.0
    // (largest-remainder method — avoids 99.8% / 100.2% drift).
    if (total > 0) {
      const scaled = rows.map(v => v.pct * 10);
      const floored = scaled.map(Math.floor);
      let remainder = Math.round(1000 - floored.reduce((s, n) => s + n, 0));
      const order = rows.map((_, i) => i).sort((a, b) => (scaled[b] - floored[b]) - (scaled[a] - floored[a]));
      for (let i = 0; i < remainder && i < order.length; i++) floored[order[i]] += 1;
      rows.forEach((v, i) => { v.pct = floored[i] / 10; });
    }
    return rows.sort((a, b) => b.wsValue - a.wsValue);
  }, [enriched]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };
  const Arrow = ({ k }) => <span className="ml-1 text-[10px] text-gray-300">{sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>;

  const handleExport = () => exportToCSV('inventory_report.csv',
    ['Product', 'SKU', 'Vendor', 'Category', 'Unit', 'Stock', 'Cost Price', 'Wholesale', 'Cost Value', 'Wholesale Value', 'Status'],
    filtered.map(p => [p.name, p.sku || '', p.vendor, p.category || '', p.unit, p.stock, p.cost, p.wholesale, p.costValue, p.wsValue, STATUS[p.status].label]),
  );

  const activeFilters = !!(search || statusFilter !== 'all' || vendorFilter || categoryFilter);
  const shown = filtered.slice(0, CAP);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Inventory Report</h1>
        <Button variant="secondary" onClick={handleExport}>⬇ Export CSV</Button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="bg-blue-50 rounded-xl p-4"><p className="text-xs text-blue-500 font-medium">Products</p><p className="text-xl font-bold text-blue-900">{products.length}</p></div>
        <div className="bg-indigo-50 rounded-xl p-4"><p className="text-xs text-indigo-500 font-medium">Units in Stock</p><p className="text-xl font-bold text-indigo-900">{stats.units.toLocaleString('en-IN')}</p></div>
        <div className="bg-green-50 rounded-xl p-4"><p className="text-xs text-green-500 font-medium">Stock Value (Cost)</p><p className="text-xl font-bold text-green-900">{formatCurrency(stats.costValue)}</p><p className="text-[11px] text-green-500 mt-0.5">money invested</p></div>
        <div className="bg-emerald-50 rounded-xl p-4"><p className="text-xs text-emerald-500 font-medium">Stock Value (Wholesale)</p><p className="text-xl font-bold text-emerald-900">{formatCurrency(stats.wsValue)}</p><p className="text-[11px] text-emerald-500 mt-0.5">potential margin {formatCurrency(stats.wsValue - stats.costValue)}</p></div>
        <div className="bg-orange-50 rounded-xl p-4"><p className="text-xs text-orange-500 font-medium">Low Stock</p><p className="text-xl font-bold text-orange-900">{counts.low}</p></div>
        <div className="bg-red-50 rounded-xl p-4"><p className="text-xs text-red-500 font-medium">Out of Stock</p><p className="text-xl font-bold text-red-900">{counts.out}</p></div>
      </div>

      {/* Stock value by vendor */}
      {byVendor.length > 0 && (
        <Card padding={false}>
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <div><h3 className="font-semibold text-gray-800">Stock Value by Vendor</h3><p className="text-xs text-gray-400 mt-0.5">Inventory you're holding per vendor — cost (money invested) and wholesale (resale value)</p></div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">{byVendor.length} vendor{byVendor.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <th className="px-4 py-2 text-left">Vendor</th>
                <th className="px-4 py-2 text-right">Products</th>
                <th className="px-4 py-2 text-right">Units</th>
                <th className="px-4 py-2 text-right">Cost Value</th>
                <th className="px-4 py-2 text-right">Wholesale Value</th>
                <th className="px-4 py-2 text-right">% of Stock (WS)</th>
              </tr></thead>
              <tbody>
                {byVendor.map((v, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800">{v.name}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{v.count}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{v.units.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2 text-right font-semibold text-green-700">{formatCurrency(v.costValue)}</td>
                    <td className="px-4 py-2 text-right text-emerald-700">{formatCurrency(v.wsValue)}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{v.pct.toFixed(1)}%</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-2 text-gray-700">Total</td>
                  <td className="px-4 py-2 text-right text-gray-700">{byVendor.reduce((s, v) => s + v.count, 0)}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{byVendor.reduce((s, v) => s + v.units, 0).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2 text-right text-green-700">{formatCurrency(byVendor.reduce((s, v) => s + v.costValue, 0))}</td>
                  <td className="px-4 py-2 text-right text-emerald-700">{formatCurrency(byVendor.reduce((s, v) => s + v.wsValue, 0))}</td>
                  <td className="px-4 py-2 text-right text-gray-500">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-center">
          <SearchBox onSearch={handleSearch} />
          <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">All Vendors</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {categories.length > 0 && (
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {activeFilters && (
            <button onClick={() => { setSearch(''); setStatusFilter('all'); setVendorFilter(''); setCategoryFilter(''); }} className="text-xs text-gray-400 hover:text-gray-600">✕ Clear</button>
          )}
        </div>
        {/* Status chips */}
        <div className="flex gap-1.5 flex-wrap mt-3">
          {[['all', 'All'], ['in', 'In Stock'], ['low', 'Low Stock'], ['out', 'Out of Stock']].map(([v, label]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                statusFilter === v
                  ? (v === 'all' ? 'bg-gray-900 text-white border-gray-900' : STATUS[v].chip)
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {label} <span className="opacity-75">({counts[v]})</span>
            </button>
          ))}
        </div>
      </Card>

      {/* Product table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 text-left"><button onClick={() => toggleSort('name')} className="hover:text-blue-600">Product <Arrow k="name" /></button></th>
                <th className="px-4 py-3 text-left">Vendor</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-right"><button onClick={() => toggleSort('stock')} className="hover:text-blue-600">Stock <Arrow k="stock" /></button></th>
                <th className="px-4 py-3 text-right">Cost</th>
                <th className="px-4 py-3 text-right">Wholesale</th>
                <th className="px-4 py-3 text-right"><button onClick={() => toggleSort('costvalue')} className="hover:text-blue-600">Cost Value <Arrow k="costvalue" /></button></th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan="8" className="text-center py-10 text-gray-400">No products match the filters</td></tr>
              ) : shown.map(p => (
                <tr key={p.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2"><p className="font-medium text-gray-900">{p.name}</p><p className="text-xs text-gray-400 font-mono">{p.sku || '—'} · {p.unit}</p></td>
                  <td className="px-4 py-2 text-gray-600">{p.vendor}</td>
                  <td className="px-4 py-2 text-gray-500">{p.category || '—'}</td>
                  <td className={`px-4 py-2 text-right font-bold ${p.status === 'out' ? 'text-red-600' : p.status === 'low' ? 'text-orange-600' : 'text-gray-800'}`}>{p.stock} <span className="text-xs font-normal text-gray-400">{p.unit}</span></td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatCurrency(p.cost)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatCurrency(p.wholesale)}</td>
                  <td className="px-4 py-2 text-right font-semibold text-gray-900">{formatCurrency(p.costValue)}</td>
                  <td className="px-4 py-2"><Badge color={STATUS[p.status].color}>{STATUS[p.status].label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
          <span>{filtered.length} of {products.length} products{filtered.length > CAP ? ` · showing first ${CAP}, narrow with search/filters` : ''}</span>
          <span>Cost value (filtered): <strong className="text-gray-700">{formatCurrency(filtered.reduce((s, p) => s + p.costValue, 0))}</strong></span>
        </div>
      </Card>
    </div>
  );
}
