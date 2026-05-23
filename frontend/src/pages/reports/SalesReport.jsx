import { useState, useMemo } from 'react';
import { useInvoices } from '../../context/InvoiceContext';
import { useCustomers } from '../../context/CustomerContext';
import { Card, Button, Badge } from '../../components/ui';
import { formatCurrency, formatDate, dateRangeFilter, exportToCSV, thisMonthStart, today, formatCustomerDisplay } from '../../utils/helpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const PLACE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

const payColor = { paid: 'green', partial: 'yellow', unpaid: 'red' };

const agingBuckets = [
  { label: '0–7 days',   key: 'b0',  color: 'bg-green-50 text-green-700 border border-green-200' },
  { label: '8–30 days',  key: 'b8',  color: 'bg-yellow-50 text-yellow-700 border border-yellow-200' },
  { label: '31–60 days', key: 'b31', color: 'bg-orange-50 text-orange-700 border border-orange-200' },
  { label: '60+ days',   key: 'b60', color: 'bg-red-50 text-red-700 border border-red-200' },
];

function agingKey(days) {
  if (days <= 7)  return 'b0';
  if (days <= 30) return 'b8';
  if (days <= 60) return 'b31';
  return 'b60';
}

function daysSince(dateStr) {
  if (!dateStr) return 0;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

export default function SalesReport() {
  const { saleInvoices } = useInvoices();
  const { customers } = useCustomers();
  const [start,       setStart]       = useState(thisMonthStart());
  const [end,         setEnd]         = useState(today());
  const [groupBy,     setGroupBy]     = useState('day');
  const [custSearch,  setCustSearch]  = useState('');
  const [payFilter,   setPayFilter]   = useState('');
  const [custType,    setCustType]    = useState('');
  const [sortTotal,   setSortTotal]   = useState(''); // '', 'asc', 'desc'
  const [minAmount,   setMinAmount]   = useState('');

  const filtered = useMemo(() => {
    let list = dateRangeFilter(saleInvoices.filter(i => i.status !== 'void'), 'date', start, end);
    if (custSearch) list = list.filter(i => (i.customerName || '').toLowerCase().includes(custSearch.toLowerCase()));
    if (payFilter)  list = list.filter(i => i.paymentStatus === payFilter);
    if (custType)   list = list.filter(i => i.customerType === custType);
    if (minAmount)  list = list.filter(i => (i.grandTotal || 0) >= parseFloat(minAmount));
    return list;
  }, [saleInvoices, start, end, custSearch, payFilter, custType, minAmount]);

  const sortedFiltered = useMemo(() => {
    if (!sortTotal) return filtered;
    return [...filtered].sort((a, b) => {
      const diff = (a.grandTotal || 0) - (b.grandTotal || 0);
      return sortTotal === 'asc' ? diff : -diff;
    });
  }, [filtered, sortTotal]);

  const totals = useMemo(() => ({
    revenue:  filtered.reduce((s, i) => s + (i.grandTotal || 0), 0),
    gst:      filtered.reduce((s, i) => s + (i.totalGST || 0), 0),
    invoices: filtered.length,
    paid:     filtered.reduce((s, i) => s + (i.amountPaid || 0), 0),
    discount: filtered.reduce((s, i) => s + (i.totalDiscount || 0), 0),
  }), [filtered]);

  // Ledger-based outstanding: sum of customer.balance for customers in the filtered period.
  // customer.balance is the authoritative all-time net amount owed (positive = owes us).
  // This captures payments made through ledger entries that may not update invoice.amountPaid.
  const totalLedgerOutstanding = useMemo(() => {
    const ids = new Set(filtered.map(i => i.customerId).filter(Boolean));
    return customers
      .filter(c => ids.has(c.id) && (c.balance || 0) > 0.01)
      .reduce((s, c) => s + (c.balance || 0), 0);
  }, [filtered, customers]);

  // Ledger-based collected = period revenue minus what those customers still owe (all-time).
  // More accurate than sum(amountPaid) when payments are recorded via ledger entries.
  const totalLedgerCollected = useMemo(() => {
    const ids = new Set(filtered.map(i => i.customerId).filter(Boolean));
    const periodRevenue = filtered.reduce((s, i) => s + (i.grandTotal || 0), 0);
    const outstanding = customers
      .filter(c => ids.has(c.id))
      .reduce((s, c) => s + Math.max(0, c.balance || 0), 0);
    return Math.max(0, periodRevenue - outstanding);
  }, [filtered, customers]);

  const chartData = useMemo(() => {
    const map = {};
    filtered.forEach(inv => {
      const key = groupBy === 'day' ? inv.date : inv.date?.slice(0, 7);
      if (!map[key]) map[key] = 0;
      map[key] += inv.grandTotal || 0;
    });
    return Object.entries(map).sort().map(([k, v]) => ({ date: k, revenue: v }));
  }, [filtered, groupBy]);

  // Top Customers — group by customerId/customerName, rank by revenue
  const topCustomers = useMemo(() => {
    const map = {};
    filtered.forEach(inv => {
      const id = inv.customerId || inv.customerName || 'Unknown';
      if (!map[id]) map[id] = { customerId: inv.customerId, name: inv.customerName || 'Unknown', revenue: 0, collected: 0, count: 0 };
      map[id].revenue   += inv.grandTotal || 0;
      map[id].collected += inv.amountPaid || 0;
      map[id].count     += 1;
    });
    return Object.values(map)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map(c => ({
        ...c,
        outstanding:   c.revenue - c.collected,
        ledgerBalance: customers.find(cu => cu.id === c.customerId)?.balance ?? null,
      }));
  }, [filtered, customers]);

  // All customers in the filtered period with outstanding amounts or ledger balance
  const customerBalances = useMemo(() => {
    const map = {};
    filtered.forEach(inv => {
      const id = inv.customerId || inv.customerName || 'Unknown';
      if (!map[id]) map[id] = { customerId: inv.customerId, name: inv.customerName || 'Unknown', place: inv.customerPlace || '', revenue: 0, collected: 0 };
      map[id].revenue   += inv.grandTotal || 0;
      map[id].collected += inv.amountPaid || 0;
    });
    return Object.values(map)
      .map(c => ({
        ...c,
        outstanding:   c.revenue - c.collected,
        ledgerBalance: customers.find(cu => cu.id === c.customerId)?.balance ?? null,
      }))
      .filter(c => c.outstanding > 0.01 || (c.ledgerBalance != null && c.ledgerBalance > 0.01))
      .sort((a, b) => (b.ledgerBalance ?? b.outstanding) - (a.ledgerBalance ?? a.outstanding));
  }, [filtered, customers]);


  // Sales by Place — group by customerPlace
  const placeData = useMemo(() => {
    const map = {};
    filtered.forEach(inv => {
      const place = (inv.customerPlace || '').trim() || '— Unknown —';
      if (!map[place]) map[place] = { place, revenue: 0, count: 0 };
      map[place].revenue += inv.grandTotal || 0;
      map[place].count   += 1;
    });
    const total = Object.values(map).reduce((s, v) => s + v.revenue, 0);
    return Object.values(map)
      .sort((a, b) => b.revenue - a.revenue)
      .map(v => ({ ...v, pct: total > 0 ? ((v.revenue / total) * 100).toFixed(1) : '0.0' }));
  }, [filtered]);

  // Aging buckets — unpaid/partial only, based on dueDate or invoice date
  const aging = useMemo(() => {
    const buckets = { b0: 0, b8: 0, b31: 0, b60: 0 };
    filtered
      .filter(i => i.paymentStatus === 'unpaid' || i.paymentStatus === 'partial')
      .forEach(i => {
        const days = daysSince(i.dueDate || i.date);
        buckets[agingKey(days)] += (i.grandTotal || 0) - (i.amountPaid || 0);
      });
    return buckets;
  }, [filtered]);

  const cycleSortTotal = () => {
    setSortTotal(s => s === '' ? 'desc' : s === 'desc' ? 'asc' : '');
  };

  const sortIcon = sortTotal === 'desc' ? '↓' : sortTotal === 'asc' ? '↑' : '⇅';

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

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1"><label className="text-xs font-medium text-gray-500">From</label><input type="date" value={start} onChange={e => setStart(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex flex-col gap-1"><label className="text-xs font-medium text-gray-500">To</label><input type="date" value={end} onChange={e => setEnd(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex flex-col gap-1 justify-end">
            <button onClick={() => { setStart(''); setEnd(today()); }} className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 font-medium whitespace-nowrap">All Time</button>
          </div>
          <div className="flex flex-col gap-1 justify-end">
            <button onClick={() => { setStart(thisMonthStart()); setEnd(today()); }} className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 font-medium whitespace-nowrap">This Month</button>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Customer</label>
            <input type="text" value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Search name…" className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[150px]" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Customer Type</label>
            <select value={custType} onChange={e => setCustType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">All Types</option>
              <option value="wholesale">Wholesale</option>
              <option value="shop">Shop</option>
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
            <label className="text-xs font-medium text-gray-500">Chart</label>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="day">Group by Day</option><option value="month">Group by Month</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Min Amount (₹)</label>
            <input
              type="number" min="0" value={minAmount}
              onChange={e => setMinAmount(e.target.value)}
              placeholder="e.g. 5000"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {(custSearch || payFilter || custType || minAmount) && (
            <button
              onClick={() => { setCustSearch(''); setPayFilter(''); setCustType(''); setMinAmount(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 mt-4"
            >✕ Clear filters</button>
          )}
        </div>
      </Card>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-xs text-blue-500 font-medium">Total Revenue</p>
          <p className="text-xl font-bold text-blue-900">{formatCurrency(totals.revenue)}</p>
          <p className="text-xs text-blue-400 mt-1">{totals.invoices} sale{totals.invoices !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-xs text-green-500 font-medium">Collected (Ledger)</p>
          <p className="text-xl font-bold text-green-900">{formatCurrency(totalLedgerCollected)}</p>
          <p className="text-xs text-green-400 mt-1">Invoice-based: {formatCurrency(totals.paid)}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4">
          <p className="text-xs text-red-500 font-medium">Outstanding (Ledger)</p>
          <p className="text-xl font-bold text-red-900">{formatCurrency(totalLedgerOutstanding)}</p>
          <p className="text-xs text-red-400 mt-1">Invoice-based: {formatCurrency(totals.revenue - totals.paid)}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4">
          <p className="text-xs text-purple-500 font-medium">Total GST</p>
          <p className="text-xl font-bold text-purple-900">{formatCurrency(totals.gst)}</p>
        </div>
        <div className="bg-pink-50 rounded-xl p-4">
          <p className="text-xs text-pink-500 font-medium">Discount Given</p>
          <p className="text-xl font-bold text-pink-900">{formatCurrency(totals.discount)}</p>
        </div>
      </div>

      {/* Revenue Trend Chart */}
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

      {/* Sales by Place */}
      {placeData.length > 0 && (
        <Card padding={false}>
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Sales by Place</h3>
            <span className="text-xs text-gray-400">{placeData.length} location{placeData.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex flex-col lg:flex-row">
            {/* Bar chart */}
            <div className="flex-1 min-w-0">
              <ResponsiveContainer width="100%" height={placeData.length * 36 + 40}>
                <BarChart
                  data={placeData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="place"
                    width={90}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value, _name, props) => [
                      `${formatCurrency(value)} (${props.payload.pct}%)`,
                      'Revenue',
                    ]}
                  />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                    {placeData.map((_, i) => (
                      <Cell key={i} fill={PLACE_COLORS[i % PLACE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Table */}
            <div className="w-full lg:w-64 lg:shrink-0 border-t lg:border-t-0 lg:border-l border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                    <th className="px-3 py-2 text-left">Place</th>
                    <th className="px-3 py-2 text-right">Revenue</th>
                    <th className="px-3 py-2 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {placeData.map((row, i) => (
                    <tr key={row.place} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 flex items-center gap-1.5">
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: PLACE_COLORS[i % PLACE_COLORS.length] }}
                        />
                        <span className="text-gray-800 font-medium truncate text-xs">{row.place}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-700 text-xs">{formatCurrency(row.revenue)}</td>
                      <td className="px-3 py-2 text-right text-gray-500 text-xs">{row.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* Top Customers */}
      <Card padding={false}>
        <div className="px-5 pt-4 pb-2"><h3 className="font-semibold text-gray-800">Top Customers</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <th className="px-4 py-2 text-left w-6">#</th>
                <th className="px-4 py-2 text-left">Customer</th>
                <th className="px-4 py-2 text-right">Revenue</th>
                <th className="px-4 py-2 text-right">Collected</th>
                <th className="px-4 py-2 text-right">Outstanding</th>
                <th className="px-4 py-2 text-right">Ledger Bal</th>
                <th className="px-4 py-2 text-right">Bills</th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.length === 0
                ? <tr><td colSpan="7" className="text-center py-6 text-gray-400">No data</td></tr>
                : topCustomers.map((c, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-4 py-2 font-medium text-gray-800">{c.name}</td>
                    <td className="px-4 py-2 text-right font-semibold text-blue-700">{formatCurrency(c.revenue)}</td>
                    <td className="px-4 py-2 text-right text-green-700">{formatCurrency(c.collected)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-red-600">{formatCurrency(c.outstanding)}</td>
                    <td className="px-4 py-2 text-right">
                      {c.ledgerBalance != null
                        ? <span className={c.ledgerBalance > 0.01 ? 'text-red-600 font-semibold' : 'text-green-600'}>{formatCurrency(c.ledgerBalance)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">{c.count}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </Card>

      {/* Customer Balances — all customers with outstanding or positive ledger balance */}
      {customerBalances.length > 0 && (
        <Card padding={false}>
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-800">Customer Outstanding Balances</h3>
              <p className="text-xs text-gray-400 mt-0.5">Customers with pending amounts in this period · Ledger balance = all-time running total</p>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">{customerBalances.length} customer{customerBalances.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-right">Invoiced (period)</th>
                  <th className="px-4 py-2 text-right">Collected (period)</th>
                  <th className="px-4 py-2 text-right">Period Outstanding</th>
                  <th className="px-4 py-2 text-right">Ledger Balance</th>
                </tr>
              </thead>
              <tbody>
                {customerBalances.map((c, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <p className="font-medium text-gray-800">{c.name}</p>
                      {c.place && <p className="text-xs text-gray-400">{c.place}</p>}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-700">{formatCurrency(c.revenue)}</td>
                    <td className="px-4 py-2 text-right text-green-700">{formatCurrency(c.collected)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${c.outstanding > 0.01 ? 'text-orange-600' : 'text-gray-400'}`}>{formatCurrency(c.outstanding)}</td>
                    <td className="px-4 py-2 text-right">
                      {c.ledgerBalance != null
                        ? <span className={`font-bold ${c.ledgerBalance > 0.01 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(c.ledgerBalance)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-gray-50 font-semibold text-sm">
                  <td className="px-4 py-2 text-gray-700">Total</td>
                  <td className="px-4 py-2 text-right text-gray-700">{formatCurrency(customerBalances.reduce((s, c) => s + c.revenue, 0))}</td>
                  <td className="px-4 py-2 text-right text-green-700">{formatCurrency(customerBalances.reduce((s, c) => s + c.collected, 0))}</td>
                  <td className="px-4 py-2 text-right text-orange-600">{formatCurrency(customerBalances.reduce((s, c) => s + c.outstanding, 0))}</td>
                  <td className="px-4 py-2 text-right text-red-600">{formatCurrency(customerBalances.filter(c => c.ledgerBalance != null).reduce((s, c) => s + c.ledgerBalance, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Outstanding Aging */}
      <div>
        <h3 className="font-semibold text-gray-800 mb-3">Outstanding Receivables Aging</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {agingBuckets.map(b => (
            <div key={b.key} className={`rounded-xl p-4 ${b.color}`}>
              <p className="text-xs font-medium mb-1">{b.label}</p>
              <p className="text-xl font-bold">{formatCurrency(aging[b.key])}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Invoice List */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 text-left">Invoice #</th>
              <th className="px-4 py-3 text-left">Customer</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-right">Subtotal</th>
              <th className="px-4 py-3 text-right">GST</th>
              <th className="px-4 py-3 text-right">
                <button
                  onClick={cycleSortTotal}
                  className="inline-flex items-center gap-1 hover:text-gray-800 transition-colors cursor-pointer"
                  title="Sort by Grand Total"
                >
                  Grand Total <span className="text-base leading-none">{sortIcon}</span>
                </button>
              </th>
              <th className="px-4 py-3">Payment</th>
            </tr></thead>
            <tbody>
              {sortedFiltered.length === 0
                ? <tr><td colSpan="7" className="text-center py-10 text-gray-400">No data for selected period</td></tr>
                : sortedFiltered.map(i => (
                  <tr key={i.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-blue-600">{i.invoiceNumber}</td>
                    <td className="px-4 py-2">{formatCustomerDisplay(i.customerName, i.customerPlace, i.customerType)}</td>
                    <td className="px-4 py-2">{formatDate(i.date)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(i.subtotal)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(i.totalGST)}</td>
                    <td className="px-4 py-2 text-right font-semibold">{formatCurrency(i.grandTotal)}</td>
                    <td className="px-4 py-2"><Badge color={payColor[i.paymentStatus]}>{i.paymentStatus}</Badge></td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
