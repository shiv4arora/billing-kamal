import { useMemo } from 'react';
import { useProducts } from '../../context/ProductContext';
import { useSettings } from '../../context/SettingsContext';
import { Card, Button, Badge } from '../../components/ui';
import { formatCurrency, exportToCSV } from '../../utils/helpers';

export default function InventoryReport() {
  const { active: products } = useProducts();
  const { settings } = useSettings();

  const stats = useMemo(() => {
    const totalValue = products.reduce((s, p) => s + (p.currentStock || 0) * (p.costPrice || 0), 0);
    const totalRetailValue = products.reduce((s, p) => s + (p.currentStock || 0) * (p.pricing?.retail || 0), 0);
    const outOfStock = products.filter(p => (p.currentStock || 0) <= 0).length;
    const lowStock = products.filter(p => { const s = p.currentStock || 0; const t = p.lowStockThreshold ?? settings.lowStockThreshold; return s > 0 && s <= t; }).length;
    return { totalValue, totalRetailValue, outOfStock, lowStock };
  }, [products, settings]);

  const handleExport = () => exportToCSV('inventory_report.csv',
    ['Product', 'SKU', 'Category', 'Unit', 'Stock', 'Cost Price', 'Retail Price', 'Stock Value (Cost)', 'Status'],
    products.map(p => {
      const stock = p.currentStock || 0;
      const thresh = p.lowStockThreshold ?? settings.lowStockThreshold;
      const status = stock <= 0 ? 'Out of Stock' : stock <= thresh ? 'Low Stock' : 'In Stock';
      return [p.name, p.sku||'', p.category||'', p.unit, stock, p.costPrice||0, p.pricing?.retail||0, stock*(p.costPrice||0), status];
    })
  );

  const getStatus = (p) => {
    const s = p.currentStock || 0;
    const t = p.lowStockThreshold ?? settings.lowStockThreshold;
    if (s <= 0) return { label: 'Out of Stock', color: 'red' };
    if (s <= t) return { label: 'Low Stock', color: 'orange' };
    return { label: 'In Stock', color: 'green' };
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Inventory Report</h1>
        <Button variant="secondary" onClick={handleExport}>⬇ Export CSV</Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-xl p-4"><p className="text-xs text-blue-500 font-medium">Total Products</p><p className="text-xl font-bold text-blue-900">{products.length}</p></div>
        <div className="bg-green-50 rounded-xl p-4"><p className="text-xs text-green-500 font-medium">Stock Value (Cost)</p><p className="text-xl font-bold text-green-900">{formatCurrency(stats.totalValue)}</p></div>
        <div className="bg-yellow-50 rounded-xl p-4"><p className="text-xs text-yellow-500 font-medium">Low Stock</p><p className="text-xl font-bold text-yellow-900">{stats.lowStock}</p></div>
        <div className="bg-red-50 rounded-xl p-4"><p className="text-xs text-red-500 font-medium">Out of Stock</p><p className="text-xl font-bold text-red-900">{stats.outOfStock}</p></div>
      </div>
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 text-left">Product</th><th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3 text-right">Cost Price</th>
              <th className="px-4 py-3 text-right">Retail Price</th><th className="px-4 py-3 text-right">Stock Value</th><th className="px-4 py-3">Status</th>
            </tr></thead>
            <tbody>
              {products.map(p => {
                const s = getStatus(p);
                return (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2"><p className="font-medium">{p.name}</p><p className="text-xs text-gray-400">{p.sku}</p></td>
                    <td className="px-4 py-2">{p.category || '-'}</td>
                    <td className="px-4 py-2 text-right font-bold">{p.currentStock || 0} {p.unit}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(p.costPrice || 0)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(p.pricing?.retail || 0)}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatCurrency((p.currentStock||0)*(p.costPrice||0))}</td>
                    <td className="px-4 py-2"><Badge color={s.color}>{s.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
