import { useState, useMemo } from 'react';
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

  const filtered = useMemo(() => {
    let list = dateRangeFilter(purchaseInvoices.filter(i => i.status !== 'void'), 'date', start, end);
    if (suppFilter) list = list.filter(i => i.supplierId === suppFilter);
    if (payFilter)  list = list.filter(i => i.paymentStatus === payFilter);
    return list;
  }, [purchaseInvoices, start, end, suppFilter, payFilter]);
  const total = filtered.reduce((s, i) => s + (i.grandTotal || 0), 0);
  const totalGST = filtered.reduce((s, i) => s + (i.totalGST || 0), 0);
  const unpaid = filtered.filter(i => i.paymentStatus !== 'paid').reduce((s, i) => s + (i.grandTotal || 0), 0);

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
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1"><label className="text-xs font-medium text-gray-500">From</label><input type="date" value={start} onChange={e => setStart(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex flex-col gap-1"><label className="text-xs font-medium text-gray-500">To</label><input type="date" value={end} onChange={e => setEnd(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
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
          {(suppFilter || payFilter) && <button onClick={() => { setSuppFilter(''); setPayFilter(''); }} className="text-xs text-gray-400 hover:text-gray-600 mt-4">✕ Clear filters</button>}
        </div>
      </Card>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-xl p-4"><p className="text-xs text-green-500 font-medium">Total Purchases</p><p className="text-xl font-bold text-green-900">{formatCurrency(total)}</p></div>
        <div className="bg-purple-50 rounded-xl p-4"><p className="text-xs text-purple-500 font-medium">GST Paid</p><p className="text-xl font-bold text-purple-900">{formatCurrency(totalGST)}</p></div>
        <div className="bg-red-50 rounded-xl p-4"><p className="text-xs text-red-500 font-medium">Payables</p><p className="text-xl font-bold text-red-900">{formatCurrency(unpaid)}</p></div>
      </div>
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
