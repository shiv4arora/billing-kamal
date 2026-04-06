import { useState, useMemo } from 'react';
import { useInvoices } from '../../context/InvoiceContext';
import { Card, Button, Badge } from '../../components/ui';
import { formatCurrency, formatDate, dateRangeFilter, exportToCSV, thisMonthStart, today, formatCustomerDisplay } from '../../utils/helpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const payColor = { paid: 'green', partial: 'yellow', unpaid: 'red' };

export default function SalesReport() {
  const { saleInvoices } = useInvoices();
  const [start, setStart] = useState(thisMonthStart());
  const [end, setEnd] = useState(today());
  const [groupBy, setGroupBy] = useState('day');

  const filtered = useMemo(() => dateRangeFilter(saleInvoices.filter(i => i.status !== 'void'), 'date', start, end), [saleInvoices, start, end]);

  const totals = useMemo(() => ({
    revenue: filtered.reduce((s, i) => s + (i.grandTotal || 0), 0),
    gst: filtered.reduce((s, i) => s + (i.totalGST || 0), 0),
    invoices: filtered.length,
    paid: filtered.filter(i => i.paymentStatus === 'paid').reduce((s, i) => s + (i.grandTotal || 0), 0),
  }), [filtered]);

  const chartData = useMemo(() => {
    const map = {};
    filtered.forEach(inv => {
      const key = groupBy === 'day' ? inv.date : inv.date?.slice(0, 7);
      if (!map[key]) map[key] = 0;
      map[key] += inv.grandTotal || 0;
    });
    return Object.entries(map).sort().map(([k, v]) => ({ date: k, revenue: v }));
  }, [filtered, groupBy]);

  const handleExport = () => {
    exportToCSV('sales_report.csv',
      ['Invoice #', 'Customer', 'Date', 'Subtotal', 'GST', 'Grand Total', 'Paid', 'Payment Status', 'Payment Method'],
      filtered.map(i => [i.invoiceNumber, formatCustomerDisplay(i.customerName, i.customerPlace, i.customerType), i.date, i.subtotal, i.totalGST, i.grandTotal, i.amountPaid || 0, i.paymentStatus, i.paymentMethod || ''])
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sales Report</h1>
        <Button variant="secondary" onClick={handleExport}>⬇ Export CSV</Button>
      </div>

      <Card>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1"><label className="text-xs font-medium text-gray-500">From</label><input type="date" value={start} onChange={e => setStart(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex flex-col gap-1"><label className="text-xs font-medium text-gray-500">To</label><input type="date" value={end} onChange={e => setEnd(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="day">Group by Day</option><option value="month">Group by Month</option>
          </select>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-xl p-4"><p className="text-xs text-blue-500 font-medium">Total Revenue</p><p className="text-xl font-bold text-blue-900">{formatCurrency(totals.revenue)}</p></div>
        <div className="bg-green-50 rounded-xl p-4"><p className="text-xs text-green-500 font-medium">Amount Collected</p><p className="text-xl font-bold text-green-900">{formatCurrency(totals.paid)}</p></div>
        <div className="bg-purple-50 rounded-xl p-4"><p className="text-xs text-purple-500 font-medium">Total GST</p><p className="text-xl font-bold text-purple-900">{formatCurrency(totals.gst)}</p></div>
        <div className="bg-gray-50 rounded-xl p-4"><p className="text-xs text-gray-500 font-medium">Invoices</p><p className="text-xl font-bold text-gray-900">{totals.invoices}</p></div>
      </div>

      {chartData.length > 0 && (
        <Card padding={false}>
          <div className="px-5 pt-4 pb-2"><h3 className="font-semibold text-gray-800">Revenue Trend</h3></div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Bar dataKey="revenue" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 text-left">Invoice #</th>
              <th className="px-4 py-3 text-left">Customer</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-right">Subtotal</th>
              <th className="px-4 py-3 text-right">GST</th>
              <th className="px-4 py-3 text-right">Grand Total</th>
              <th className="px-4 py-3">Payment</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan="7" className="text-center py-10 text-gray-400">No data for selected period</td></tr> :
              filtered.map(i => (
                <tr key={i.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-blue-600">{i.invoiceNumber}</td>
                  <td className="px-4 py-2">{formatCustomerDisplay(i.customerName, i.customerPlace, i.customerType)}</td>
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
