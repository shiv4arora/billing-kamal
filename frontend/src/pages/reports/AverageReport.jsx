import { useState, useMemo } from 'react';
import { useInvoices } from '../../context/InvoiceContext';
import { Card, Button } from '../../components/ui';
import { formatCurrency, formatDate, dateRangeFilter, exportToCSV, thisMonthStart, today, formatCustomerDisplay } from '../../utils/helpers';

const unitsOf = (inv) => (inv.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);

export default function AverageReport() {
  const { saleInvoices } = useInvoices();
  const [start, setStart] = useState(thisMonthStart());
  const [end, setEnd] = useState(today());
  const [custSearch, setCustSearch] = useState('');
  const [sortKey, setSortKey] = useState('date'); // date | units | total | avg
  const [sortDir, setSortDir] = useState('desc');

  const rows = useMemo(() => {
    // Real sales only — exclude drafts and deleted.
    let list = dateRangeFilter(saleInvoices.filter(i => i.status !== 'void' && i.status !== 'draft'), 'date', start, end);
    if (custSearch) list = list.filter(i => (i.customerName || '').toLowerCase().includes(custSearch.toLowerCase()));
    const mapped = list.map(i => {
      const units = unitsOf(i);
      const total = i.grandTotal || 0;
      return { ...i, units, total, avg: units > 0 ? total / units : 0 };
    });
    return mapped.sort((a, b) => {
      let va, vb;
      if (sortKey === 'units')      { va = a.units; vb = b.units; }
      else if (sortKey === 'total') { va = a.total; vb = b.total; }
      else if (sortKey === 'avg')   { va = a.avg;   vb = b.avg; }
      else                          { va = a.date;  vb = b.date; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [saleInvoices, start, end, custSearch, sortKey, sortDir]);

  const totals = useMemo(() => {
    const units = rows.reduce((s, r) => s + r.units, 0);
    const value = rows.reduce((s, r) => s + r.total, 0);
    return { bills: rows.length, units, value, avg: units > 0 ? value / units : 0 };
  }, [rows]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };
  const Arrow = ({ k }) => <span className="ml-1 text-[10px] text-gray-300">{sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>;

  const handleExport = () => exportToCSV('average_report.csv',
    ['Bill No', 'Party', 'Date', 'Units Sold', 'Total Bill', 'Avg per Piece'],
    rows.map(r => [r.invoiceNumber, formatCustomerDisplay(r.customerName, r.customerPlace, r.customerType), r.date, r.units, r.total, r.avg.toFixed(2)]),
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Average Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Per-bill average price = total bill ÷ units sold</p>
        </div>
        <Button variant="secondary" onClick={handleExport}>⬇ Export CSV</Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1"><label className="text-xs font-medium text-gray-500">From</label><input type="date" value={start} onChange={e => setStart(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex flex-col gap-1"><label className="text-xs font-medium text-gray-500">To</label><input type="date" value={end} onChange={e => setEnd(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
          <button onClick={() => { setStart(''); setEnd(today()); }} className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 font-medium whitespace-nowrap">All Time</button>
          <button onClick={() => { setStart(thisMonthStart()); setEnd(today()); }} className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 font-medium whitespace-nowrap">This Month</button>
          <div className="flex flex-col gap-1"><label className="text-xs font-medium text-gray-500">Party</label><input type="text" value={custSearch} onChange={e => setCustSearch(e.target.value)} placeholder="Search name…" className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[150px]" /></div>
          {custSearch && <button onClick={() => setCustSearch('')} className="text-xs text-gray-400 hover:text-gray-600 mb-2">✕ Clear</button>}
        </div>
      </Card>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-xl p-4"><p className="text-xs text-blue-500 font-medium">Bills</p><p className="text-xl font-bold text-blue-900">{totals.bills}</p></div>
        <div className="bg-indigo-50 rounded-xl p-4"><p className="text-xs text-indigo-500 font-medium">Total Units Sold</p><p className="text-xl font-bold text-indigo-900">{totals.units.toLocaleString('en-IN')}</p></div>
        <div className="bg-green-50 rounded-xl p-4"><p className="text-xs text-green-500 font-medium">Total Bill Value</p><p className="text-xl font-bold text-green-900">{formatCurrency(totals.value)}</p></div>
        <div className="bg-purple-50 rounded-xl p-4"><p className="text-xs text-purple-500 font-medium">Avg / Piece</p><p className="text-xl font-bold text-purple-900">{totals.units > 0 ? formatCurrency(totals.avg) : '—'}</p></div>
      </div>

      {/* Table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 text-left">Bill No</th>
              <th className="px-4 py-3 text-left">Party</th>
              <th className="px-4 py-3 text-left"><button onClick={() => toggleSort('date')} className="hover:text-blue-600">Date <Arrow k="date" /></button></th>
              <th className="px-4 py-3 text-right"><button onClick={() => toggleSort('units')} className="hover:text-blue-600">Units Sold <Arrow k="units" /></button></th>
              <th className="px-4 py-3 text-right"><button onClick={() => toggleSort('total')} className="hover:text-blue-600">Total Bill <Arrow k="total" /></button></th>
              <th className="px-4 py-3 text-right"><button onClick={() => toggleSort('avg')} className="hover:text-blue-600">Avg / Pc <Arrow k="avg" /></button></th>
            </tr></thead>
            <tbody>
              {rows.length === 0
                ? <tr><td colSpan="6" className="text-center py-10 text-gray-400">No bills for the selected period</td></tr>
                : rows.map(r => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-blue-600">{r.invoiceNumber}</td>
                    <td className="px-4 py-2">{formatCustomerDisplay(r.customerName, r.customerPlace, r.customerType)}</td>
                    <td className="px-4 py-2 text-gray-500">{formatDate(r.date)}</td>
                    <td className="px-4 py-2 text-right">{r.units.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2 text-right font-semibold">{formatCurrency(r.total)}</td>
                    <td className="px-4 py-2 text-right text-purple-700 font-medium">{r.units > 0 ? formatCurrency(r.avg) : '—'}</td>
                  </tr>
                ))
              }
              {rows.length > 0 && (
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-2 text-gray-700" colSpan="3">Total · {totals.bills} bills</td>
                  <td className="px-4 py-2 text-right text-gray-700">{totals.units.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2 text-right text-blue-700">{formatCurrency(totals.value)}</td>
                  <td className="px-4 py-2 text-right text-purple-700">{totals.units > 0 ? formatCurrency(totals.avg) : '—'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
