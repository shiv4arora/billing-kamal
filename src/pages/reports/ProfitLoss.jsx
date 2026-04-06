import { useState, useMemo } from 'react';
import { useInvoices } from '../../context/InvoiceContext';
import { useProducts } from '../../context/ProductContext';
import { Card, Button } from '../../components/ui';
import { formatCurrency, dateRangeFilter, exportToCSV, thisMonthStart, today } from '../../utils/helpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function ProfitLoss() {
  const { saleInvoices, purchaseInvoices } = useInvoices();
  const { products } = useProducts();
  const [start, setStart] = useState(thisMonthStart());
  const [end, setEnd] = useState(today());

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);

  const data = useMemo(() => {
    const sales = dateRangeFilter(saleInvoices.filter(i => i.status !== 'void'), 'date', start, end);
    const purchases = dateRangeFilter(purchaseInvoices.filter(i => i.status !== 'void'), 'date', start, end);

    const totalRevenue = sales.reduce((s, i) => s + (i.grandTotal || 0), 0);
    const totalGSTCollected = sales.reduce((s, i) => s + (i.totalGST || 0), 0);
    const netRevenue = totalRevenue - totalGSTCollected;

    let cogs = 0;
    sales.forEach(inv => {
      (inv.items || []).forEach(item => {
        const prod = productMap[item.productId];
        cogs += (prod?.costPrice || 0) * item.quantity;
      });
    });

    const totalPurchases = purchases.reduce((s, i) => s + (i.subtotal || 0), 0);
    const grossProfit = netRevenue - cogs;
    const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

    // Monthly chart
    const monthMap = {};
    sales.forEach(inv => {
      const m = inv.date?.slice(0, 7);
      if (!monthMap[m]) monthMap[m] = { month: m.slice(5), revenue: 0, cogs: 0 };
      monthMap[m].revenue += inv.grandTotal || 0;
      (inv.items || []).forEach(item => { monthMap[m].cogs += (productMap[item.productId]?.costPrice || 0) * item.quantity; });
    });
    const chartData = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({ ...m, profit: m.revenue - m.cogs }));

    return { totalRevenue, totalGSTCollected, netRevenue, cogs, totalPurchases, grossProfit, grossMargin, chartData, salesCount: sales.length, purchaseCount: purchases.length };
  }, [saleInvoices, purchaseInvoices, productMap, start, end]);

  const handleExport = () => exportToCSV('profit_loss.csv',
    ['Metric', 'Amount'],
    [['Total Revenue', data.totalRevenue], ['GST Collected', data.totalGSTCollected], ['Net Revenue', data.netRevenue], ['COGS', data.cogs], ['Gross Profit', data.grossProfit], ['Gross Margin %', data.grossMargin.toFixed(2)]]
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Profit & Loss</h1>
        <Button variant="secondary" onClick={handleExport}>⬇ Export CSV</Button>
      </div>
      <Card>
        <div className="flex gap-4 items-end">
          <div className="flex flex-col gap-1"><label className="text-xs font-medium text-gray-500">From</label><input type="date" value={start} onChange={e => setStart(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex flex-col gap-1"><label className="text-xs font-medium text-gray-500">To</label><input type="date" value={end} onChange={e => setEnd(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-xl p-4"><p className="text-xs text-blue-500 font-medium">Total Revenue</p><p className="text-xl font-bold text-blue-900">{formatCurrency(data.totalRevenue)}</p></div>
        <div className="bg-red-50 rounded-xl p-4"><p className="text-xs text-red-500 font-medium">Cost of Goods</p><p className="text-xl font-bold text-red-900">{formatCurrency(data.cogs)}</p></div>
        <div className={`rounded-xl p-4 ${data.grossProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}><p className={`text-xs font-medium ${data.grossProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>Gross Profit</p><p className={`text-xl font-bold ${data.grossProfit >= 0 ? 'text-green-900' : 'text-red-900'}`}>{formatCurrency(data.grossProfit)}</p></div>
        <div className="bg-purple-50 rounded-xl p-4"><p className="text-xs text-purple-500 font-medium">Gross Margin</p><p className="text-xl font-bold text-purple-900">{data.grossMargin.toFixed(1)}%</p></div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">Summary</h3>
          <div className="space-y-3 text-sm">
            {[
              { label: 'Total Revenue (incl. GST)', value: data.totalRevenue, cls: 'text-blue-700' },
              { label: 'GST Collected', value: data.totalGSTCollected, cls: 'text-gray-600' },
              { label: 'Net Revenue (excl. GST)', value: data.netRevenue, cls: 'text-gray-900 font-semibold' },
              { label: 'Cost of Goods Sold', value: data.cogs, cls: 'text-red-600' },
              { label: 'Gross Profit', value: data.grossProfit, cls: `font-bold text-base ${data.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}` },
            ].map(r => (
              <div key={r.label} className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                <span className="text-gray-600">{r.label}</span>
                <span className={r.cls}>{formatCurrency(r.value)}</span>
              </div>
            ))}
          </div>
        </Card>

        {data.chartData.length > 0 && (
          <Card padding={false}>
            <div className="px-5 pt-4 pb-2"><h3 className="font-semibold text-gray-800">Monthly P&L</h3></div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.chartData} margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" radius={[3,3,0,0]} />
                <Bar dataKey="cogs" fill="#ef4444" name="COGS" radius={[3,3,0,0]} />
                <Bar dataKey="profit" fill="#10b981" name="Profit" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>
    </div>
  );
}
