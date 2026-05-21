import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useInvoices } from '../../context/InvoiceContext';
import { useSuppliers } from '../../context/SupplierContext';
import { Card, Button, Badge } from '../../components/ui';
import { formatCurrency, formatDate, dateRangeFilter, exportToCSV, thisMonthStart, today } from '../../utils/helpers';

const payColor = { paid: 'green', partial: 'yellow', unpaid: 'red' };

export default function PurchasesReport() {
  const { purchaseInvoices } = useInvoices();
  const { active: suppliers } = useSuppliers();
  const [start,      setStart]      = useState(thisMonthStart());
  const [end,        setEnd]        = useState(today());
  const [suppFilter, setSuppFilter] = useState('');
  const [payFilter,  setPayFilter]  = useState('');
  const [groupBy,    setGroupBy]    = useState('day');

  const filtered = useMemo(() => {
    let list = dateRangeFilter(purchaseInvoices.filter(i => i.status !== 'void'), 'date', start, end);
    if (suppFilter) list = list.filter(i => i.supplierId === suppFilter);
    if (payFilter)  list = list.filter(i => i.paymentStatus === payFilter);
    return list;
  }, [purchaseInvoices, start, end, suppFilter, payFilter]);

  const total    = filtered.reduce((s, i) => s + (i.grandTotal || 0), 0);
  const totalGST = filtered.reduce((s, i) => s + (i.totalGST   || 0), 0);
  const unpaid   = filtered.filter(i => i.paymentStatus !== 'paid').reduce((s, i) => s + (i.grandTotal || 0), 0);

  // --- Spend trend chart data ---
  const trendData = useMemo(() => {
    const buckets = {};
    filtered.forEach(inv => {
      const d = inv.date ? new Date(inv.date) : null;
      if (!d || isNaN(d)) return;
      let key;
      if (groupBy === 'month') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else {
        key = inv.date.slice(0, 10);
      }
      buckets[key] = (buckets[key] || 0) + (inv.grandTotal || 0);
    });
    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, spend]) => ({ label, spend }));
  }, [filtered, groupBy]);

  // --- Spend by supplier (all vendors) ---
  const supplierSpendData = useMemo(() => {
    const map = {};
    filtered.forEach(inv => {
      const name = inv.supplierName || inv.supplierId || 'Unknown';
      map[name] = (map[name] || 0) + (inv.grandTotal || 0);
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([name, spend]) => ({ name, spend }));
  }, [filtered]);

  // --- Payables aging ---
  const agingBuckets = useMemo(() => {
    const buckets = { '0–7': 0, '8–30': 0, '31–60': 0, '60+': 0 };
    const now = new Date();
    filtered
      .filter(inv => inv.paymentStatus === 'unpaid' || inv.paymentStatus === 'partial')
      .forEach(inv => {
        const outstanding = (inv.grandTotal || 0) - (inv.amountPaid || 0);
        if (outstanding <= 0) return;
        const refDate = inv.dueDate || inv.date;
        const due = refDate ? new Date(refDate) : now;
        const days = Math.floor((now - due) / 86400000);
        if (days <= 7)       buckets['0–7']   += outstanding;
        else if (days <= 30) buckets['8–30']  += outstanding;
        else if (days <= 60) buckets['31–60'] += outstanding;
        else                 buckets['60+']   += outstanding;
      });
    return buckets;
  }, [filtered]);


  const handleExport = () => exportToCSV('purchases_report.csv',
    ['Invoice #', 'Supplier', 'Supplier Ref', 'Date', 'Subtotal', 'GST', 'Grand Total', 'Payment Status'],
    filtered.map(i => [i.invoiceNumber, i.supplierName, i.supplierInvoiceNumber || '', i.date, i.subtotal, i.totalGST, i.grandTotal, i.paymentStatus])
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Purchases Report</h1>
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
            <button onClick={() => { setStart(''); setEnd(today()); }} className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 font-medium whitespace-nowrap">All Time</button>
          </div>
          <div className="flex flex-col gap-1 justify-end">
            <button onClick={() => { setStart(thisMonthStart()); setEnd(today()); }} className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 font-medium whitespace-nowrap">This Month</button>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Supplier</label>
            <select value={suppFilter} onChange={e => setSuppFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-w-[160px]">
              <option value="">All Suppliers</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Payment</label>
            <select value={payFilter} onChange={e => setPayFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">All</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Group By</label>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="day">Group by Day</option>
              <option value="month">Group by Month</option>
            </select>
          </div>
          {(suppFilter || payFilter) && (
            <button onClick={() => { setSuppFilter(''); setPayFilter(''); }} className="text-xs text-gray-400 hover:text-gray-600 mt-4">✕ Clear filters</button>
          )}
        </div>
      </Card>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-xl p-4"><p className="text-xs text-green-500 font-medium">Total Purchases</p><p className="text-xl font-bold text-green-900">{formatCurrency(total)}</p></div>
        <div className="bg-purple-50 rounded-xl p-4"><p className="text-xs text-purple-500 font-medium">GST Paid</p><p className="text-xl font-bold text-purple-900">{formatCurrency(totalGST)}</p></div>
        <div className="bg-red-50 rounded-xl p-4"><p className="text-xs text-red-500 font-medium">Payables</p><p className="text-xl font-bold text-red-900">{formatCurrency(unpaid)}</p></div>
      </div>

      {/* Spend trend chart */}
      <Card>
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Spend Trend</h2>
        {trendData.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No data for selected range</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="spend" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Spend by supplier */}
      {supplierSpendData.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Spend by Supplier</h2>
          <ResponsiveContainer width="100%" height={Math.max(200, supplierSpendData.length * 40 + 20)}>
            <BarChart data={supplierSpendData} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={140} />
              <Tooltip formatter={v => formatCurrency(v)} contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="spend" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Aging + Top products side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Payables aging */}
        <Card>
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Payables Aging</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 rounded-xl p-4">
              <p className="text-xs font-medium text-green-600">0–7 days</p>
              <p className="text-lg font-bold text-green-900 mt-1">{formatCurrency(agingBuckets['0–7'])}</p>
            </div>
            <div className="bg-yellow-50 rounded-xl p-4">
              <p className="text-xs font-medium text-yellow-600">8–30 days</p>
              <p className="text-lg font-bold text-yellow-900 mt-1">{formatCurrency(agingBuckets['8–30'])}</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-4">
              <p className="text-xs font-medium text-orange-600">31–60 days</p>
              <p className="text-lg font-bold text-orange-900 mt-1">{formatCurrency(agingBuckets['31–60'])}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-4">
              <p className="text-xs font-medium text-red-600">60+ days</p>
              <p className="text-lg font-bold text-red-900 mt-1">{formatCurrency(agingBuckets['60+'])}</p>
            </div>
          </div>
        </Card>

      </div>

      {/* Invoice table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 text-left">Invoice #</th><th className="px-4 py-3 text-left">Supplier</th>
              <th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-right">Subtotal</th>
              <th className="px-4 py-3 text-right">GST</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Payment</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan="7" className="text-center py-10 text-gray-400">No data</td></tr> :
              filtered.map(i => (
                <tr key={i.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-green-700">{i.invoiceNumber}</td>
                  <td className="px-4 py-2">{i.supplierName}</td>
                  <td className="px-4 py-2">{formatDate(i.date)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(i.subtotal)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(i.totalGST)}</td>
                  <td className="px-4 py-2 text-right font-semibold">{formatCurrency(i.grandTotal)}</td>
                  <td className="px-4 py-2"><Badge color={payColor[i.paymentStatus]}>{i.paymentStatus}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
