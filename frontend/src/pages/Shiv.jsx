import { useState, useMemo } from 'react';
import { useInvoices } from '../context/InvoiceContext';
import { Card } from '../components/ui';
import { formatCurrency, formatDate, dateRangeFilter, exportToCSV, thisMonthStart, today } from '../utils/helpers';

export default function Shiv() {
  const { saleInvoices } = useInvoices();
  const [start, setStart] = useState('');          // blank = all time
  const [end, setEnd] = useState(today());
  const [selected, setSelected] = useState(null);  // selected item name for drilldown

  // Collect every free-text line from issued / non-void invoices
  const allFreeTextLines = useMemo(() => {
    const invoices = start
      ? dateRangeFilter(saleInvoices.filter(i => i.status !== 'void'), 'date', start, end)
      : saleInvoices.filter(i => i.status !== 'void');

    const lines = [];
    invoices.forEach(inv => {
      (inv.items || []).forEach(item => {
        if (!item.isFreeText || !item.productName?.trim()) return;
        const gross = (item.quantity || 0) * (item.unitPrice || 0);
        const disc  = (gross * (item.discountPct || 0)) / 100;
        lines.push({
          name:          item.productName.trim(),
          qty:           item.quantity || 0,
          unit:          item.unit || 'Pcs',
          unitPrice:     item.unitPrice || 0,
          discountPct:   item.discountPct || 0,
          amount:        gross - disc,
          invoiceId:     inv.id,
          invoiceNumber: inv.invoiceNumber || '—',
          date:          inv.date,
          customerName:  inv.customerName || '—',
        });
      });
    });
    return lines;
  }, [saleInvoices, start, end]);

  // Group by name (case-insensitive key, display-case preserved from first occurrence)
  const grouped = useMemo(() => {
    const map = {};
    allFreeTextLines.forEach(line => {
      const key = line.name.toLowerCase();
      if (!map[key]) map[key] = { displayName: line.name, unit: line.unit, totalQty: 0, totalAmount: 0, invoiceCount: 0, lines: [] };
      map[key].totalQty    += line.qty;
      map[key].totalAmount += line.amount;
      map[key].invoiceCount += 1;
      map[key].lines.push(line);
    });
    return Object.values(map).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [allFreeTextLines]);

  const grandQty    = grouped.reduce((s, g) => s + g.totalQty, 0);
  const grandAmount = grouped.reduce((s, g) => s + g.totalAmount, 0);

  const selectedGroup = selected ? grouped.find(g => g.displayName.toLowerCase() === selected.toLowerCase()) : null;

  const handleExport = () => {
    exportToCSV(
      'free_text_items.csv',
      ['Item Name', 'Unit', 'Total Qty', 'Total Amount (₹)', '# Entries'],
      grouped.map(g => [g.displayName, g.unit, g.totalQty, g.totalAmount.toFixed(2), g.invoiceCount])
    );
  };

  const handleExportDetail = () => {
    if (!selectedGroup) return;
    exportToCSV(
      `free_text_${selectedGroup.displayName}.csv`,
      ['Invoice #', 'Date', 'Customer', 'Qty', 'Unit Price (₹)', 'Disc%', 'Amount (₹)'],
      selectedGroup.lines.map(l => [l.invoiceNumber, l.date, l.customerName, l.qty, l.unitPrice, l.discountPct, l.amount.toFixed(2)])
    );
  };

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Free Text Items</h1>
          <p className="text-sm text-gray-500 mt-0.5">All manually entered items across sale invoices</p>
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* Date filter */}
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">From</label>
            <input type="date" value={start} onChange={e => { setStart(e.target.value); setSelected(null); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">To</label>
            <input type="date" value={end} onChange={e => { setEnd(e.target.value); setSelected(null); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button onClick={() => { setStart(thisMonthStart()); setEnd(today()); setSelected(null); }}
            className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 font-medium">
            This Month
          </button>
          <button onClick={() => { setStart(''); setEnd(today()); setSelected(null); }}
            className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 font-medium">
            All Time
          </button>
        </div>
      </Card>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Unique Items</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{grouped.length}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total Qty Sold</p>
          <p className="text-3xl font-bold text-blue-700 mt-1">{grandQty}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total Revenue</p>
          <p className="text-3xl font-bold text-green-700 mt-1">{formatCurrency(grandAmount)}</p>
        </Card>
      </div>

      {grouped.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-500 font-medium">No free text items found</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting the date range, or add free text lines to your invoices.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left: summary table */}
          <Card padding={false}>
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">All Items</h3>
              <span className="text-xs text-gray-400">{grouped.length} items · click to drill down</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3 text-left">Item</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(g => (
                    <tr
                      key={g.displayName}
                      onClick={() => setSelected(prev => prev === g.displayName ? null : g.displayName)}
                      className={`border-b cursor-pointer transition-colors ${
                        selected === g.displayName
                          ? 'bg-orange-50 border-l-2 border-l-orange-400'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{g.displayName}</p>
                        <p className="text-xs text-gray-400">{g.unit}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">{g.totalQty}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-700">{formatCurrency(g.totalAmount)}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{g.invoiceCount}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t font-bold text-sm">
                    <td className="px-4 py-3 text-gray-700">Total</td>
                    <td className="px-4 py-3 text-right text-blue-700">{grandQty}</td>
                    <td className="px-4 py-3 text-right text-green-700">{formatCurrency(grandAmount)}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{allFreeTextLines.length}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* Right: drilldown */}
          <Card padding={false}>
            {!selectedGroup ? (
              <div className="flex items-center justify-center h-full min-h-[200px] text-gray-400 flex-col gap-2">
                <span className="text-3xl">👈</span>
                <p className="text-sm">Select an item to see invoice details</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-800">{selectedGroup.displayName}</h3>
                    <p className="text-xs text-gray-400">{selectedGroup.invoiceCount} entries · {selectedGroup.totalQty} {selectedGroup.unit} · {formatCurrency(selectedGroup.totalAmount)}</p>
                  </div>
                  <button onClick={handleExportDetail}
                    className="text-xs px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 font-medium">
                    ⬇ CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                        <th className="px-4 py-3 text-left">Invoice</th>
                        <th className="px-4 py-3 text-left">Customer</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3 text-right">Rate</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedGroup.lines
                        .slice()
                        .sort((a, b) => b.date?.localeCompare(a.date))
                        .map((line, i) => (
                          <tr key={i} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-2.5">
                              <p className="font-mono text-xs font-semibold text-blue-700">{line.invoiceNumber}</p>
                              <p className="text-xs text-gray-400">{formatDate(line.date)}</p>
                            </td>
                            <td className="px-4 py-2.5 text-gray-700 text-xs">{line.customerName}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-blue-700">{line.qty}</td>
                            <td className="px-4 py-2.5 text-right text-gray-600">{formatCurrency(line.unitPrice)}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-green-700">{formatCurrency(line.amount)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
