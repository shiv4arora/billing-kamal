import { useState, useMemo } from 'react';
import { useInvoices } from '../../context/InvoiceContext';
import { useProducts } from '../../context/ProductContext';
import { useSuppliers } from '../../context/SupplierContext';
import { Card, Button } from '../../components/ui';
import { formatCurrency, exportToCSV, thisMonthStart, today, dateRangeFilter } from '../../utils/helpers';

export default function VendorSalesReport() {
  const { saleInvoices } = useInvoices();
  const { active: products } = useProducts();
  const { active: suppliers } = useSuppliers();

  const [start, setStart] = useState(thisMonthStart());
  const [end, setEnd] = useState(today());

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
    dateRangeFilter(saleInvoices.filter(i => i.status !== 'void' && i.status !== 'draft'), 'date', start, end),
    [saleInvoices, start, end]
  );

  // Build vendor → product → { qty, value }
  const vendorData = useMemo(() => {
    const map = {}; // vendorKey → { supplierId, supplierName, products: { productId → {...} } }
    filtered.forEach(inv => {
      (inv.items || []).forEach(item => {
        const prod = productMap[item.productId];
        const supplierId = prod?.supplierId || '__none__';
        const supplierName = supplierId === '__none__' ? '— No Vendor Assigned —' : (supplierMap[supplierId]?.name || 'Unknown Vendor');
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
    // Convert to array, sort by total value desc
    return Object.values(map)
      .map(v => ({
        ...v,
        products: Object.values(v.products).sort((a, b) => b.value - a.value),
        totalValue: Object.values(v.products).reduce((s, p) => s + p.value, 0),
        totalQty: Object.values(v.products).reduce((s, p) => s + p.qty, 0),
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [filtered, productMap, supplierMap]);

  const grandTotal = useMemo(() => vendorData.reduce((s, v) => s + v.totalValue, 0), [vendorData]);
  const grandQty = useMemo(() => vendorData.reduce((s, v) => s + v.totalQty, 0), [vendorData]);

  const handleExport = () => {
    const rows = [];
    vendorData.forEach(v => {
      v.products.forEach(p => {
        rows.push([v.supplierName, p.sku, p.name, p.qty, p.value.toFixed(2)]);
      });
    });
    exportToCSV('vendor_sales_report.csv', ['Vendor', 'SKU', 'Product', 'Qty Sold', 'Total Value (₹)'], rows);
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
          <input type="date" value={start} onChange={e => setStart(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <Button variant="outline" onClick={handleExport}>⬇ Export CSV</Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-xs text-blue-500 font-semibold uppercase">Vendors with Sales</p>
          <p className="text-2xl font-bold text-blue-900 mt-1">{vendorData.filter(v => v.supplierId !== '__none__').length}</p>
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

      {/* Vendor Cards */}
      {vendorData.length === 0 ? (
        <Card>
          <div className="py-12 text-center text-gray-400">
            <p className="text-4xl mb-3">📦</p>
            <p className="font-medium">No sales data for selected period</p>
          </div>
        </Card>
      ) : (
        vendorData.map(vendor => (
          <Card key={vendor.supplierId} padding={false}>
            <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="font-semibold text-gray-900">{vendor.supplierName}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{vendor.products.length} product(s)</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-green-700">{formatCurrency(vendor.totalValue)}</p>
                <p className="text-xs text-gray-400">{vendor.totalQty} units sold</p>
              </div>
            </div>
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
          </Card>
        ))
      )}
    </div>
  );
}
