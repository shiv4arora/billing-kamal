import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../hooks/useApi';
import { Card, Button } from '../../components/ui';
import { formatDate, formatCurrency, dateRangeFilter, exportToCSV, thisMonthStart, today } from '../../utils/helpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ProductionReport() {
  const [entries, setEntries]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [start,   setStart]       = useState(thisMonthStart());
  const [end,     setEnd]         = useState(today());
  const [search,     setSearch]     = useState('');
  const [boxFilter,  setBoxFilter]  = useState('');
  const [groupBy,    setGroupBy]    = useState('day');
  const [view,       setView]       = useState('entries'); // 'entries' | 'outputs' | 'inputs'

  useEffect(() => {
    api('/production')
      .then(d => setEntries(d))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  /* ── all unique non-empty box values (for dropdown) ── */
  const allBoxes = useMemo(() => {
    const set = new Set();
    entries.forEach(e => { if (e.box && e.box.trim()) set.add(e.box.trim()); });
    return [...set].sort();
  }, [entries]);

  /* ── filtered entries ── */
  const filtered = useMemo(() => {
    let list = dateRangeFilter(entries, 'date', start, end);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        (e.outputs || []).some(o => (o.productName || '').toLowerCase().includes(q)) ||
        (e.components || []).some(c => (c.productName || '').toLowerCase().includes(q)) ||
        (e.entryNumber || '').toLowerCase().includes(q)
      );
    }
    if (boxFilter) list = list.filter(e => (e.box || '').trim() === boxFilter);
    return list;
  }, [entries, start, end, search, boxFilter]);

  /* ── summary ── */
  const totals = useMemo(() => {
    let outputQty = 0, componentQty = 0, wholesaleValue = 0, shopValue = 0;
    const outputProducts = new Set();
    filtered.forEach(e => {
      (e.outputs || []).forEach(o => {
        const qty = Number(o.quantity) || 0;
        outputQty += qty;
        outputProducts.add(o.productId);
        const p = o.pricing || {};
        wholesaleValue += qty * (Number(p.wholesale) || 0);
        shopValue      += qty * (Number(p.shop)      || 0);
      });
      (e.components || []).forEach(c => { componentQty += Number(c.quantity) || 0; });
    });
    return { entries: filtered.length, outputQty, componentQty, uniqueProducts: outputProducts.size, wholesaleValue, shopValue };
  }, [filtered]);

  /* ── chart: entries per day/month ── */
  const chartData = useMemo(() => {
    const map = {};
    filtered.forEach(e => {
      const key = groupBy === 'day' ? e.date : (e.date || '').slice(0, 7);
      if (!map[key]) map[key] = { entries: 0, qty: 0 };
      map[key].entries += 1;
      (e.outputs || []).forEach(o => { map[key].qty += Number(o.quantity) || 0; });
    });
    return Object.entries(map).sort().map(([k, v]) => ({ date: k, ...v }));
  }, [filtered, groupBy]);

  /* ── top outputs ── */
  const outputSummary = useMemo(() => {
    const map = {};
    filtered.forEach(e => {
      (e.outputs || []).forEach(o => {
        if (!map[o.productId]) map[o.productId] = { name: o.productName, runs: 0, qty: 0 };
        map[o.productId].runs += 1;
        map[o.productId].qty  += Number(o.quantity) || 0;
      });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }, [filtered]);

  /* ── top inputs (components) ── */
  const inputSummary = useMemo(() => {
    const map = {};
    filtered.forEach(e => {
      (e.components || []).forEach(c => {
        if (!map[c.productId]) map[c.productId] = { name: c.productName, runs: 0, qty: 0 };
        map[c.productId].runs += 1;
        map[c.productId].qty  += Number(c.quantity) || 0;
      });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }, [filtered]);

  /* ── export ── */
  const handleExport = () => {
    exportToCSV(
      'production_report.csv',
      ['Entry #', 'Date', 'Output Products', 'Output Qty', 'Components Used', 'Component Qty', 'Notes'],
      filtered.map(e => [
        e.entryNumber,
        e.date,
        (e.outputs || []).map(o => o.productName).join('; '),
        (e.outputs || []).reduce((s, o) => s + (Number(o.quantity) || 0), 0),
        (e.components || []).map(c => c.productName).join('; '),
        (e.components || []).reduce((s, c) => s + (Number(c.quantity) || 0), 0),
        e.notes || '',
      ])
    );
  };

  /* ── dark-aware input classes ── */
  const inputCls = 'border border-gray-300 dark:border-[rgba(84,84,88,0.65)] rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#2C2C2E] dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

  if (loading) return <div className="py-16 text-center text-gray-400 dark:text-gray-500">Loading…</div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Production Report</h1>
        <Button variant="secondary" onClick={handleExport}>⬇ Export CSV</Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">From</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">To</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1 justify-end">
            <button onClick={() => { setStart(''); setEnd(today()); }}
              className="px-3 py-2 bg-gray-100 dark:bg-[#3A3A3C] text-gray-600 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-200 font-medium whitespace-nowrap">
              All Time
            </button>
          </div>
          <div className="flex flex-col gap-1 justify-end">
            <button onClick={() => { setStart(thisMonthStart()); setEnd(today()); }}
              className="px-3 py-2 bg-gray-100 dark:bg-[#3A3A3C] text-gray-600 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-200 font-medium whitespace-nowrap">
              This Month
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Search product / entry#</label>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="e.g. Necklace…" className={`${inputCls} min-w-[180px]`} />
          </div>
          {allBoxes.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Filter by Box</label>
              <select value={boxFilter} onChange={e => setBoxFilter(e.target.value)} className={`${inputCls} min-w-[140px]`}>
                <option value="">All Boxes</option>
                {allBoxes.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Chart</label>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)} className={inputCls}>
              <option value="day">Group by Day</option>
              <option value="month">Group by Month</option>
            </select>
          </div>
          {(search || boxFilter) && (
            <button onClick={() => { setSearch(''); setBoxFilter(''); }} className="text-xs text-gray-400 hover:text-gray-600 mt-4">
              ✕ Clear filters
            </button>
          )}
        </div>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-blue-50 dark:bg-[rgba(10,132,255,0.12)] rounded-xl p-4">
          <p className="text-xs text-blue-500 dark:text-[#0A84FF] font-medium">Production Runs</p>
          <p className="text-2xl font-bold text-blue-900 dark:text-[#0A84FF]">{totals.entries}</p>
        </div>
        <div className="bg-green-50 dark:bg-[rgba(48,209,88,0.12)] rounded-xl p-4">
          <p className="text-xs text-green-600 dark:text-[#30D158] font-medium">Wholesale Value</p>
          <p className="text-2xl font-bold text-green-900 dark:text-[#30D158]">{formatCurrency(totals.wholesaleValue)}</p>
        </div>
        <div className="bg-teal-50 dark:bg-[rgba(48,176,199,0.12)] rounded-xl p-4">
          <p className="text-xs text-teal-600 dark:text-[#5AC8FA] font-medium">Output Qty</p>
          <p className="text-2xl font-bold text-teal-900 dark:text-[#5AC8FA]">{totals.outputQty.toLocaleString()}</p>
        </div>
        <div className="bg-purple-50 dark:bg-[rgba(191,90,242,0.12)] rounded-xl p-4">
          <p className="text-xs text-purple-600 dark:text-[#BF5AF2] font-medium">Unique Products</p>
          <p className="text-2xl font-bold text-purple-900 dark:text-[#BF5AF2]">{totals.uniqueProducts}</p>
        </div>
        <div className="bg-orange-50 dark:bg-[rgba(255,159,10,0.12)] rounded-xl p-4">
          <p className="text-xs text-orange-600 dark:text-[#FF9F0A] font-medium">Components Consumed</p>
          <p className="text-2xl font-bold text-orange-900 dark:text-[#FF9F0A]">{totals.componentQty.toLocaleString()}</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card padding={false}>
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 dark:text-white">Production Activity</h3>
            <span className="text-xs text-gray-400">bars = output qty</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(val, name) => [val, name === 'qty' ? 'Output Qty' : 'Entries']}
              />
              <Bar dataKey="qty" fill="#8b5cf6" radius={[3, 3, 0, 0]} name="Output Qty" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Tab selector */}
      <div className="flex gap-1 bg-gray-100 dark:bg-[#2C2C2E] rounded-lg p-1 w-fit">
        {[['entries', '📋 Entries'], ['outputs', '✅ Outputs'], ['inputs', '🧱 Inputs']].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors
              ${view === v
                ? 'bg-white dark:bg-[#3A3A3C] text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Entries table */}
      {view === 'entries' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#1C1C1E] border-b border-gray-200 dark:border-[rgba(84,84,88,0.65)] text-xs text-gray-500 dark:text-[#636366] uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Entry #</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Output Products</th>
                  <th className="px-4 py-3 text-right">Output Qty</th>
                  <th className="px-4 py-3 text-right">W Value</th>
                  <th className="px-4 py-3 text-right">S Value</th>
                  <th className="px-4 py-3 text-left">Components Used</th>
                  <th className="px-4 py-3 text-right">Comp. Qty</th>
                  <th className="px-4 py-3 text-left">Box</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-12 text-gray-400">No production entries for this period</td></tr>
                ) : filtered.map(e => {
                  const totalOut  = (e.outputs    || []).reduce((s, o) => s + (Number(o.quantity) || 0), 0);
                  const totalComp = (e.components || []).reduce((s, c) => s + (Number(c.quantity) || 0), 0);
                  const wVal = (e.outputs || []).reduce((s, o) => s + (Number(o.quantity) || 0) * (Number(o.pricing?.wholesale) || 0), 0);
                  const sVal = (e.outputs || []).reduce((s, o) => s + (Number(o.quantity) || 0) * (Number(o.pricing?.shop)      || 0), 0);
                  return (
                    <tr key={e.id} className="border-b border-gray-100 dark:border-[rgba(84,84,88,0.35)] hover:bg-gray-50 dark:hover:bg-[#2C2C2E]">
                      <td className="px-4 py-3">
                        <Link to={`/production/${e.id}/edit`}
                          className="font-medium text-blue-600 dark:text-[#0A84FF] hover:underline">
                          {e.entryNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-[#f2f2f7]">{formatDate(e.date)}</td>
                      <td className="px-4 py-3 text-gray-800 dark:text-[#f2f2f7]">
                        {(e.outputs || []).map((o, i) => (
                          <span key={i} className="block text-xs">{o.productName}{(e.outputs.length > 1) ? ` ×${o.quantity}` : ''}</span>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{totalOut}</td>
                      <td className="px-4 py-3 text-right text-blue-700 dark:text-[#0A84FF] font-medium">{wVal > 0 ? formatCurrency(wVal) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-right text-purple-700 dark:text-[#BF5AF2] font-medium">{sVal > 0 ? formatCurrency(sVal) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-[#f2f2f7]">
                        {(e.components || []).map((c, i) => (
                          <span key={i} className="block text-xs">{c.productName}{(e.components.length > 1) ? ` ×${c.quantity}` : ''}</span>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-[#f2f2f7]">{totalComp}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-[#f2f2f7]">{e.box || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 max-w-[160px] truncate">{e.notes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Output product summary */}
      {view === 'outputs' && (
        <Card padding={false}>
          <div className="px-5 py-3 border-b border-gray-100 dark:border-[rgba(84,84,88,0.35)]">
            <h3 className="font-semibold text-gray-800 dark:text-white">Output Products</h3>
            <p className="text-xs text-gray-400 mt-0.5">Finished goods produced in the selected period</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#1C1C1E] border-b border-gray-200 dark:border-[rgba(84,84,88,0.65)] text-xs text-gray-500 dark:text-[#636366] uppercase tracking-wide">
                  <th className="px-4 py-3 text-left w-8">#</th>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-right">Production Runs</th>
                  <th className="px-4 py-3 text-right">Total Qty Made</th>
                </tr>
              </thead>
              <tbody>
                {outputSummary.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-12 text-gray-400">No data</td></tr>
                ) : outputSummary.map((p, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-[rgba(84,84,88,0.35)] hover:bg-gray-50 dark:hover:bg-[#2C2C2E]">
                    <td className="px-4 py-3 text-gray-400 dark:text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-[#f2f2f7]">{p.name}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-[#f2f2f7]">{p.runs}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700 dark:text-[#30D158]">{p.qty.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Input / component summary */}
      {view === 'inputs' && (
        <Card padding={false}>
          <div className="px-5 py-3 border-b border-gray-100 dark:border-[rgba(84,84,88,0.35)]">
            <h3 className="font-semibold text-gray-800 dark:text-white">Components Consumed</h3>
            <p className="text-xs text-gray-400 mt-0.5">Raw materials used in production in the selected period</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#1C1C1E] border-b border-gray-200 dark:border-[rgba(84,84,88,0.65)] text-xs text-gray-500 dark:text-[#636366] uppercase tracking-wide">
                  <th className="px-4 py-3 text-left w-8">#</th>
                  <th className="px-4 py-3 text-left">Component</th>
                  <th className="px-4 py-3 text-right">Used in # Entries</th>
                  <th className="px-4 py-3 text-right">Total Qty Consumed</th>
                </tr>
              </thead>
              <tbody>
                {inputSummary.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-12 text-gray-400">No data</td></tr>
                ) : inputSummary.map((c, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-[rgba(84,84,88,0.35)] hover:bg-gray-50 dark:hover:bg-[#2C2C2E]">
                    <td className="px-4 py-3 text-gray-400 dark:text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-[#f2f2f7]">{c.name}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-[#f2f2f7]">{c.runs}</td>
                    <td className="px-4 py-3 text-right font-semibold text-orange-700 dark:text-[#FF9F0A]">{c.qty.toLocaleString()}</td>
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
