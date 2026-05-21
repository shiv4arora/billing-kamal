import { useState, useMemo, useEffect } from 'react';
import { useInvoices } from '../../context/InvoiceContext';
import { useProducts } from '../../context/ProductContext';
import { Card, Button } from '../../components/ui';
import { formatCurrency, dateRangeFilter, exportToCSV, thisMonthStart, today } from '../../utils/helpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, ReferenceLine } from 'recharts';
import { api } from '../../hooks/useApi';

const MFG_MARGIN = 0.20; // manufactured goods margin assumption

// Compute COGS for a single line item.
// Manufactured products (in mfgProductIds) → COGS = revenue × (1 - MFG_MARGIN)
// Free text items (no productId)            → COGS = revenue × (1 - MFG_MARGIN) (estimated)
// Purchased products                        → COGS = costPrice × qty
function itemCogs(item, prod, mfgProductIds) {
  const qty      = item.quantity || 0;
  const revenue  = item.lineTotal != null
    ? item.lineTotal
    : qty * (item.unitPrice || 0) * (1 - (item.discountPct || 0) / 100);
  if (item.isFreeText || !item.productId) {
    return { revenue, cost: revenue * (1 - MFG_MARGIN), isMfg: false, isFreeText: true };
  }
  if (mfgProductIds.has(item.productId)) {
    return { revenue, cost: revenue * (1 - MFG_MARGIN), isMfg: true, isFreeText: false };
  }
  return { revenue, cost: (prod?.costPrice || 0) * qty, isMfg: false, isFreeText: false };
}

function buildData(saleInvoices, purchaseInvoices, productMap, start, end, mfgProductIds) {
  const sales     = dateRangeFilter(saleInvoices.filter(i => i.status !== 'void'), 'date', start, end);
  const purchases = dateRangeFilter(purchaseInvoices.filter(i => i.status !== 'void'), 'date', start, end);

  const totalRevenue      = sales.reduce((s, i) => s + (i.grandTotal  || 0), 0);
  const totalGSTCollected = sales.reduce((s, i) => s + (i.totalGST    || 0), 0);
  const totalDiscount     = sales.reduce((s, i) => s + (i.totalDiscount || 0), 0);
  const netRevenue        = totalRevenue - totalGSTCollected;
  const totalPurchases    = purchases.reduce((s, i) => s + (i.subtotal || 0), 0);

  let cogs = 0;
  sales.forEach(inv => {
    (inv.items || []).forEach(item => {
      const prod = productMap[item.productId];
      cogs += itemCogs(item, prod, mfgProductIds).cost;
    });
  });

  const grossProfit  = netRevenue - cogs;
  const grossMargin  = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

  // Monthly chart
  const monthMap = {};
  sales.forEach(inv => {
    const m = inv.date?.slice(0, 7);
    if (!m) return;
    if (!monthMap[m]) monthMap[m] = { month: m.slice(5), fullMonth: m, revenue: 0, cogs: 0 };
    monthMap[m].revenue += inv.grandTotal || 0;
    (inv.items || []).forEach(item => {
      const prod = productMap[item.productId];
      monthMap[m].cogs += itemCogs(item, prod, mfgProductIds).cost;
    });
  });
  const chartData = Object.values(monthMap)
    .sort((a, b) => a.fullMonth.localeCompare(b.fullMonth))
    .map(m => ({ ...m, profit: m.revenue - m.cogs }));

  // Top profitable products (includes free text items)
  const prodProfitMap = {};
  sales.forEach(inv => {
    (inv.items || []).forEach(item => {
      const isFt = item.isFreeText || (!item.productId && item.productName?.trim());
      if (!item.productId && !isFt) return;
      const prod = item.productId ? productMap[item.productId] : null;
      if (item.productId && !prod) return;
      const key = item.productId || `ft:${(item.productName || '').trim().toLowerCase()}`;
      const name = prod ? prod.name : (item.productName || 'Free Text Item');
      const { revenue, cost, isMfg, isFreeText } = itemCogs(item, prod, mfgProductIds);
      const profit = revenue - cost;
      if (!prodProfitMap[key]) prodProfitMap[key] = {
        name, sku: item.sku || prod?.sku || '',
        vendorCode: prod?.supplier?.code || prod?.supplier?.name || '',
        isMfg, isFreeText, qty: 0, revenue: 0, cost: 0, profit: 0,
      };
      prodProfitMap[key].qty     += item.quantity || 0;
      prodProfitMap[key].revenue += revenue;
      prodProfitMap[key].cost    += cost;
      prodProfitMap[key].profit  += profit;
    });
  });
  const topProfitable = Object.values(prodProfitMap)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 15)
    .map(p => ({ ...p, margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0 }));

  // Loss products (sold below cost)
  const lossProducts = Object.values(prodProfitMap)
    .filter(p => p.profit < 0)
    .sort((a, b) => a.profit - b.profit)
    .map(p => ({ ...p, margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0 }));

  return { totalRevenue, totalGSTCollected, totalDiscount, netRevenue, cogs, totalPurchases, grossProfit, grossMargin, chartData, salesCount: sales.length, purchaseCount: purchases.length, topProfitable, lossProducts };
}

export default function ProfitLoss() {
  const { saleInvoices, purchaseInvoices } = useInvoices();
  const { products } = useProducts();
  const [start, setStart] = useState(thisMonthStart());
  const [end,   setEnd]   = useState(today());
  const [productionEntries, setProductionEntries] = useState([]);

  useEffect(() => {
    api('/production').then(d => setProductionEntries(d)).catch(() => {});
  }, []);

  const productMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);

  // Set of product IDs that are manufactured (appear as outputs in any production run)
  const mfgProductIds = useMemo(() => {
    const ids = new Set();
    productionEntries.forEach(entry => {
      (entry.outputs || []).forEach(o => { if (o.productId) ids.add(o.productId); });
    });
    return ids;
  }, [productionEntries]);

  const data = useMemo(() => buildData(saleInvoices, purchaseInvoices, productMap, start, end, mfgProductIds), [saleInvoices, purchaseInvoices, productMap, start, end, mfgProductIds]);

  // Previous period for MoM comparison
  const prevData = useMemo(() => {
    if (!start) return null;
    const startDate = new Date(start);
    const endDate   = new Date(end);
    const spanMs    = endDate - startDate;
    const prevEnd   = new Date(startDate - 1);
    const prevStart = new Date(startDate - spanMs - 1);
    const ps = prevStart.toISOString().slice(0, 10);
    const pe = prevEnd.toISOString().slice(0, 10);
    return buildData(saleInvoices, purchaseInvoices, productMap, ps, pe, mfgProductIds);
  }, [saleInvoices, purchaseInvoices, productMap, start, end, mfgProductIds]);

  const momRevenue = prevData && prevData.totalRevenue > 0
    ? ((data.totalRevenue - prevData.totalRevenue) / prevData.totalRevenue) * 100 : null;
  const momProfit = prevData && prevData.grossProfit !== 0
    ? ((data.grossProfit - prevData.grossProfit) / Math.abs(prevData.grossProfit)) * 100 : null;

  const handleExport = () => exportToCSV('profit_loss.csv',
    ['Metric', 'Amount'],
    [
      ['Total Revenue', data.totalRevenue],
      ['GST Collected', data.totalGSTCollected],
      ['Discount Given', data.totalDiscount],
      ['Net Revenue', data.netRevenue],
      ['COGS', data.cogs],
      ['Gross Profit', data.grossProfit],
      ['Gross Margin %', data.grossMargin.toFixed(2)],
      ['Total Purchases', data.totalPurchases],
    ]
  );

  const MomBadge = ({ val, label }) => {
    if (val === null) return null;
    const up = val >= 0;
    return (
      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {up ? '↑' : '↓'} {Math.abs(val).toFixed(1)}% vs prev {label}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Profit & Loss</h1>
        <Button variant="secondary" onClick={handleExport}>⬇ Export CSV</Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">From</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">To</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1 justify-end">
            <button onClick={() => { setStart(thisMonthStart()); setEnd(today()); }} className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 font-medium whitespace-nowrap">This Month</button>
          </div>
          <div className="flex flex-col gap-1 justify-end">
            <button onClick={() => { setStart(''); setEnd(today()); }} className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 font-medium whitespace-nowrap">All Time</button>
          </div>
        </div>
      </Card>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-xs text-blue-500 font-medium mb-1">Total Revenue</p>
          <p className="text-xl font-bold text-blue-900">{formatCurrency(data.totalRevenue)}</p>
          <MomBadge val={momRevenue} label="period" />
        </div>
        <div className="bg-red-50 rounded-xl p-4">
          <p className="text-xs text-red-500 font-medium mb-1">Cost of Goods</p>
          <p className="text-xl font-bold text-red-900">{formatCurrency(data.cogs)}</p>
        </div>
        <div className={`rounded-xl p-4 ${data.grossProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
          <p className={`text-xs font-medium mb-1 ${data.grossProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>Gross Profit</p>
          <p className={`text-xl font-bold ${data.grossProfit >= 0 ? 'text-green-900' : 'text-red-900'}`}>{formatCurrency(data.grossProfit)}</p>
          <MomBadge val={momProfit} label="period" />
        </div>
        <div className="bg-purple-50 rounded-xl p-4">
          <p className="text-xs text-purple-500 font-medium mb-1">Gross Margin</p>
          <p className="text-xl font-bold text-purple-900">{data.grossMargin.toFixed(1)}%</p>
        </div>
      </div>

      {/* Secondary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-500 font-medium">Net Revenue (ex-GST)</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(data.netRevenue)}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4">
          <p className="text-xs text-orange-500 font-medium">Discount Given</p>
          <p className="text-lg font-bold text-orange-900 mt-1">{formatCurrency(data.totalDiscount)}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4">
          <p className="text-xs text-yellow-600 font-medium">GST Collected</p>
          <p className="text-lg font-bold text-yellow-900 mt-1">{formatCurrency(data.totalGSTCollected)}</p>
        </div>
        <div className="bg-indigo-50 rounded-xl p-4">
          <p className="text-xs text-indigo-500 font-medium">Total Purchases</p>
          <p className="text-lg font-bold text-indigo-900 mt-1">{formatCurrency(data.totalPurchases)}</p>
        </div>
      </div>

      {/* Summary breakdown + Monthly chart side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="font-semibold text-gray-800 mb-4">P&L Summary</h3>
          <div className="space-y-3 text-sm">
            {[
              { label: 'Total Revenue (incl. GST)',  value: data.totalRevenue,      cls: 'text-blue-700' },
              { label: 'GST Collected',              value: -data.totalGSTCollected, cls: 'text-gray-500' },
              { label: 'Discount Given',             value: -data.totalDiscount,     cls: 'text-orange-600' },
              { label: 'Net Revenue',                value: data.netRevenue,         cls: 'text-gray-900 font-semibold' },
              { label: 'Cost of Goods Sold (COGS)',  value: -data.cogs,              cls: 'text-red-600' },
              { label: 'Gross Profit',               value: data.grossProfit,        cls: `font-bold text-base ${data.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}` },
            ].map(r => (
              <div key={r.label} className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
                <span className="text-gray-600">{r.label}</span>
                <span className={r.cls}>{r.value < 0 ? `−${formatCurrency(Math.abs(r.value))}` : formatCurrency(r.value)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
            {mfgProductIds.size > 0 && (
              <p className="text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2">
                ⚙ <span className="font-medium">{mfgProductIds.size} manufactured product{mfgProductIds.size !== 1 ? 's' : ''}</span> — COGS at {Math.round((1 - MFG_MARGIN) * 100)}% of revenue ({MFG_MARGIN * 100}% margin)
              </p>
            )}
            <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
              📝 <span className="font-medium">Free text items</span> — COGS estimated at {Math.round((1 - MFG_MARGIN) * 100)}% of revenue ({MFG_MARGIN * 100}% margin assumed)
            </p>
          </div>
          {prevData && (
            <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400 space-y-1">
              <p className="font-medium text-gray-500 mb-1">vs Previous Period</p>
              <div className="flex justify-between"><span>Revenue</span><span>{formatCurrency(prevData.totalRevenue)}</span></div>
              <div className="flex justify-between"><span>Gross Profit</span><span>{formatCurrency(prevData.grossProfit)}</span></div>
              <div className="flex justify-between"><span>Margin</span><span>{prevData.grossMargin.toFixed(1)}%</span></div>
            </div>
          )}
        </Card>

        {data.chartData.length > 0 ? (
          <Card padding={false}>
            <div className="px-5 pt-4 pb-2"><h3 className="font-semibold text-gray-800">Monthly P&L</h3></div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.chartData} margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="revenue" fill="#3b82f6" name="Revenue"  radius={[3,3,0,0]} />
                <Bar dataKey="cogs"    fill="#ef4444" name="COGS"     radius={[3,3,0,0]} />
                <Bar dataKey="profit"  fill="#10b981" name="Profit"   radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        ) : (
          <Card><div className="py-12 text-center text-gray-400"><p className="text-3xl mb-2">📊</p><p>No monthly data for this period</p></div></Card>
        )}
      </div>

      {/* Profit trend line chart (full width) */}
      {data.chartData.length > 1 && (
        <Card padding={false}>
          <div className="px-5 pt-4 pb-2"><h3 className="font-semibold text-gray-800">Profit Trend</h3></div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data.chartData} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 2" />
              <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Profit" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Top Profitable Products */}
      {data.topProfitable.length > 0 && (
        <Card padding={false}>
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Top Profitable Products</h3>
            <span className="text-xs text-gray-400">by gross profit</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">Product</th>
                  <th className="px-4 py-2 text-left">SKU</th>
                  <th className="px-4 py-2 text-left">Vendor</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2 text-right">Revenue</th>
                  <th className="px-4 py-2 text-right">COGS</th>
                  <th className="px-4 py-2 text-right">Profit</th>
                  <th className="px-4 py-2 text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.topProfitable.map((p, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[180px] truncate">{p.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-blue-600">{p.sku ? `#${p.sku}` : '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{p.vendorCode || '—'}</td>
                    <td className="px-4 py-2.5">
                      {p.isFreeText
                        ? <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">Free Text</span>
                        : p.isMfg
                          ? <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Mfg</span>
                          : <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Purchased</span>
                      }
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{p.qty}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{formatCurrency(p.revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-red-600">{formatCurrency(p.cost)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-green-700">{formatCurrency(p.profit)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${p.margin >= 30 ? 'bg-green-100 text-green-700' : p.margin >= 10 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        {p.margin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Loss Alert */}
      {data.lossProducts.length > 0 && (
        <Card padding={false}>
          <div className="px-5 py-3 border-b flex items-center gap-3 bg-red-50">
            <h3 className="font-semibold text-red-800">⚠ Sold Below Cost</h3>
            <span className="text-xs bg-red-100 text-red-700 border border-red-200 rounded-full px-2 py-0.5 font-medium">{data.lossProducts.length} product{data.lossProducts.length > 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                  <th className="px-4 py-2 text-left">Product</th>
                  <th className="px-4 py-2 text-left">SKU</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2 text-right">Revenue</th>
                  <th className="px-4 py-2 text-right">COGS</th>
                  <th className="px-4 py-2 text-right">Loss</th>
                </tr>
              </thead>
              <tbody>
                {data.lossProducts.map((p, i) => (
                  <tr key={i} className="border-b hover:bg-red-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{p.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-blue-600">{p.sku ? `#${p.sku}` : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{p.qty}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{formatCurrency(p.revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-red-600">{formatCurrency(p.cost)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-red-700">−{formatCurrency(Math.abs(p.profit))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
