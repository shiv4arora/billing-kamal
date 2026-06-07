import { useState, useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import { useInvoices } from '../../context/InvoiceContext';
import { useProducts } from '../../context/ProductContext';
import { useSuppliers } from '../../context/SupplierContext';
import { Card, Button } from '../../components/ui';
import { formatCurrency, exportToCSV, thisMonthStart, today, dateRangeFilter } from '../../utils/helpers';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

function buildVendorData(filtered, productMap, supplierMap) {
  const map = {};
  filtered.forEach(inv => {
    (inv.items || []).forEach(item => {
      const prod = productMap[item.productId];
      const supplierId = prod?.supplierId || '__none__';
      const supplierName =
        supplierId === '__none__'
          ? '— No Vendor Assigned —'
          : supplierMap[supplierId]?.name || 'Unknown Vendor';
      if (!map[supplierId]) map[supplierId] = { supplierId, supplierName, products: {} };
      const pKey = item.productId || item.productName;
      if (!map[supplierId].products[pKey]) {
        map[supplierId].products[pKey] = {
          productId: item.productId,
          name: item.productName,
          sku: item.sku || prod?.sku || '',
          qty: 0,
          value: 0,
        };
      }
      map[supplierId].products[pKey].qty += item.quantity || 0;
      map[supplierId].products[pKey].value += item.lineTotal || 0;
    });
  });
  return Object.values(map)
    .map(v => ({
      ...v,
      products: Object.values(v.products).sort((a, b) => b.value - a.value),
      totalValue: Object.values(v.products).reduce((s, p) => s + p.value, 0),
      totalQty: Object.values(v.products).reduce((s, p) => s + p.qty, 0),
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

export default function VendorSalesReport() {
  const { saleInvoices } = useInvoices();
  const { active: products } = useProducts();
  const { active: suppliers } = useSuppliers();

  const [start, setStart] = useState(thisMonthStart());
  const [end, setEnd] = useState(today());
  const [vendorFilter, setVendorFilter] = useState('');
  const [skuSearch, setSkuSearch] = useState('');
  const [expanded, setExpanded] = useState(new Set()); // supplierId keys — all collapsed by default

  const toggleCollapse = (id) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const productMap = useMemo(() => {
    const m = {};
    products.forEach(p => { m[p.id] = p; });
    return m;
  }, [products]);

  const supplierMap = useMemo(() => {
    const m = {};
    suppliers.forEach(s => { m[s.id] = s; });
    return m;
  }, [suppliers]);

  const filtered = useMemo(() =>
    dateRangeFilter(
      saleInvoices.filter(i => i.status !== 'void' && i.status !== 'draft'),
      'date', start, end
    ),
    [saleInvoices, start, end]
  );

  // Full unfiltered vendor data — used for charts, summary tiles, slow movers
  const allVendorData = useMemo(
    () => buildVendorData(filtered, productMap, supplierMap),
    [filtered, productMap, supplierMap]
  );

  // Filtered + searched data — used only for the detail cards
  const vendorData = useMemo(() => {
    let data = allVendorData;
    if (vendorFilter) data = data.filter(v => v.supplierId === vendorFilter);
    if (skuSearch.trim()) {
      const q = skuSearch.toLowerCase();
      data = data
        .map(v => ({
          ...v,
          products: v.products.filter(
            p =>
              p.sku?.toLowerCase().includes(q) ||
              p.name?.toLowerCase().includes(q)
          ),
        }))
        .filter(v => v.products.length > 0);
    }
    return data;
  }, [allVendorData, vendorFilter, skuSearch]);

  // Summary always from allVendorData
  const grandTotal = useMemo(
    () => allVendorData.reduce((s, v) => s + v.totalValue, 0),
    [allVendorData]
  );
  const grandQty = useMemo(
    () => allVendorData.reduce((s, v) => s + v.totalQty, 0),
    [allVendorData]
  );

  // Pie chart data (exclude __none__ if no value, but include if present)
  const pieData = useMemo(
    () =>
      allVendorData
        .filter(v => v.supplierId !== '__none__' && v.totalValue > 0)
        .map((v, i) => ({
          name: v.supplierName,
          value: v.totalValue,
          pct: grandTotal > 0 ? ((v.totalValue / grandTotal) * 100).toFixed(1) : '0.0',
          color: COLORS[i % COLORS.length],
        })),
    [allVendorData, grandTotal]
  );

  // Bar chart data (same vendors as pie, sorted desc)
  const barData = useMemo(
    () =>
      allVendorData
        .filter(v => v.supplierId !== '__none__' && v.totalValue > 0)
        .map((v, i) => ({
          name: v.supplierName,
          value: v.totalValue,
          color: COLORS[i % COLORS.length],
        })),
    [allVendorData]
  );

  const handleExport = () => {
    const rows = [];
    allVendorData.forEach(v => {
      v.products.forEach(p => {
        rows.push([v.supplierName, p.sku, p.name, p.qty, p.value.toFixed(2)]);
      });
    });
    exportToCSV(
      'vendor_sales_report.csv',
      ['Vendor', 'SKU', 'Product', 'Qty Sold', 'Total Value (₹)'],
      rows
    );
  };

  const renderPieLegend = (props) => {
    const { payload } = props;
    return (
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2 px-4">
        {payload.map((entry, i) => (
          <li key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
            <span>{entry.value} ({pieData.find(p => p.name === entry.value)?.pct ?? 0}%)</span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendor-wise Sales</h1>
          <p className="text-sm text-gray-500 mt-0.5">Sales grouped by product vendor/supplier</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date" value={start} onChange={e => setStart(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date" value={end} onChange={e => setEnd(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => { setStart(''); setEnd(today()); }}
            className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 font-medium whitespace-nowrap"
          >All Time</button>
          <Button variant="outline" onClick={handleExport}>⬇ Export CSV</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-xs text-blue-500 font-semibold uppercase">Vendors with Sales</p>
          <p className="text-2xl font-bold text-blue-900 mt-1">
            {allVendorData.filter(v => v.supplierId !== '__none__').length}
          </p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4">
          <p className="text-xs text-purple-500 font-semibold uppercase">Total Items Sold</p>
          <p className="text-2xl font-bold text-purple-900 mt-1">{grandQty.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-xs text-green-500 font-semibold uppercase">Total Sales Value</p>
          <p className="text-2xl font-bold text-green-900 mt-1">{formatCurrency(grandTotal)}</p>
        </div>
      </div>

      {/* Vendor Share % — full width */}
      {pieData.length > 0 && (
        <Card>
          <p className="text-sm font-semibold text-gray-700 mb-3">Vendor Share %</p>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="45%"
                outerRadius={120}
                label={false}
                labelLine={false}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => {
                const item = pieData.find(p => p.name === name);
                return [`${formatCurrency(value)} (${item?.pct ?? 0}%)`, name];
              }} />
              <Legend content={renderPieLegend} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Vendor Comparison — full width */}
      {barData.length > 0 && (
        <Card>
          <p className="text-sm font-semibold text-gray-700 mb-3">Vendor Sales Comparison</p>
          <ResponsiveContainer width="100%" height={Math.max(200, barData.length * 44 + 20)}>
            <BarChart
              data={barData}
              layout="vertical"
              margin={{ top: 4, right: 60, bottom: 4, left: 120 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={116}
                tick={{ fontSize: 11 }}
              />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {barData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Filter row */}
      <Card>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase">Vendor</label>
            <select
              value={vendorFilter}
              onChange={e => setVendorFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
            >
              <option value="">All vendors</option>
              {allVendorData
                .filter(v => v.supplierId !== '__none__')
                .map(v => (
                  <option key={v.supplierId} value={v.supplierId}>
                    {v.supplierName}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase">SKU / Product</label>
            <input
              type="text"
              value={skuSearch}
              onChange={e => setSkuSearch(e.target.value)}
              placeholder="Search SKU or product name…"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px]"
            />
          </div>
          {(vendorFilter || skuSearch) && (
            <button
              onClick={() => { setVendorFilter(''); setSkuSearch(''); }}
              className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </Card>

      {/* Vendor Detail Cards */}
      {vendorData.length === 0 ? (
        <Card>
          <div className="py-12 text-center text-gray-400">
            <p className="text-4xl mb-3">📦</p>
            <p className="font-medium">
              {allVendorData.length === 0
                ? 'No sales data for selected period'
                : 'No vendors match the current filters'}
            </p>
          </div>
        </Card>
      ) : (
        vendorData.map(vendor => {
          const pct = grandTotal > 0 ? ((vendor.totalValue / grandTotal) * 100).toFixed(1) : null;
          const isCollapsed = !expanded.has(vendor.supplierId);
          return (
            <Card key={vendor.supplierId} padding={false}>
              <button
                onClick={() => toggleCollapse(vendor.supplierId)}
                className="w-full px-5 py-4 border-b flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <div>
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <span className="text-gray-400 text-xs">{isCollapsed ? '▶' : '▼'}</span>
                    {vendor.supplierName}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {vendor.products.length} product(s)
                    {pct !== null && <span className="ml-2 text-blue-500 font-medium">{pct}% of total</span>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-green-700">{formatCurrency(vendor.totalValue)}</p>
                  <p className="text-xs text-gray-400">{vendor.totalQty} units sold</p>
                </div>
              </button>
              {!isCollapsed && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase border-b bg-white">
                      <th className="px-4 py-2 text-left w-24">SKU</th>
                      <th className="px-4 py-2 text-left">Product Name</th>
                      <th className="px-4 py-2 text-right w-24">Qty Sold</th>
                      <th className="px-4 py-2 text-right w-32">Total Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendor.products.map(p => (
                      <tr key={p.productId || p.name} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-mono text-blue-600 text-xs">{p.sku ? `#${p.sku}` : '—'}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{p.name}</td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{p.qty.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(p.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold text-sm">
                      <td colSpan="2" className="px-4 py-2.5 text-gray-600">Vendor Total</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{vendor.totalQty.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-2.5 text-right text-green-700">{formatCurrency(vendor.totalValue)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
