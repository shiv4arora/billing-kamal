import { useState, useMemo, useRef, useCallback, memo } from 'react';
import * as XLSX from 'xlsx';
import { useInvoices } from '../../context/InvoiceContext';
import { useCustomers } from '../../context/CustomerContext';
import { Card, Button } from '../../components/ui';
import { formatCurrency, formatDate, formatCustomerDisplay } from '../../utils/helpers';

const SearchBox = memo(function SearchBox({ onSearch }) {
  const timerRef = useRef(null);
  return (
    <div className="relative flex-1 min-w-[200px]">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm">🔍</span>
      <input
        defaultValue=""
        onChange={e => { clearTimeout(timerRef.current); timerRef.current = setTimeout(() => onSearch(e.target.value), 150); }}
        placeholder="Search name, place or phone…"
        className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white w-full"
      />
    </div>
  );
});

export default function CreditorsReport() {
  const { saleInvoices } = useInvoices();
  const { active: customers } = useCustomers();
  const [search, setSearch] = useState('');
  const handleSearch = useCallback(v => setSearch(v), []);

  // Latest real invoice per customer — for a bill to reference on the call
  const latestByCustomer = useMemo(() => {
    const m = {};
    saleInvoices.forEach(i => {
      if (i.status === 'void' || i.status === 'draft' || !i.customerId) return;
      const cur = m[i.customerId];
      if (!cur || (i.date || '') >= (cur.date || '')) m[i.customerId] = i;
    });
    return m;
  }, [saleInvoices]);

  // Customers who currently owe money (live ledger balance > 0), biggest first
  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return customers
      .filter(c => (Number(c.balance) || 0) > 0.01)
      .map(c => {
        const last = latestByCustomer[c.id];
        return {
          id: c.id,
          name: c.name || '',
          place: c.place || '',
          nameplace: formatCustomerDisplay(c.name, c.place, c.type),
          amount: Number(c.balance) || 0,
          phone: (c.phone || '').replace(/\D/g, ''),
          billNo: last?.invoiceNumber || '',
          billDate: last?.date || '',
        };
      })
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.place.toLowerCase().includes(q) || r.phone.includes(q))
      .sort((a, b) => b.amount - a.amount);
  }, [customers, latestByCustomer, search]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);

  const exportExcel = () => {
    const data = rows.map(r => ({
      'Bill No':        r.billNo,
      'Name & Place':   [r.name, r.place].filter(Boolean).join(' — '),
      'Ledger Amount':  r.amount,
      'Bill Date':      r.billDate ? formatDate(r.billDate) : '',
      'Contact Number': r.phone,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 12 }, { wch: 34 }, { wch: 14 }, { wch: 13 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Debtors');
    XLSX.writeFile(wb, `debtors-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const waMessage = (r) => encodeURIComponent(
    `Dear ${r.name || 'Customer'},\nThis is a reminder that ${formatCurrency(r.amount)} is pending on your account. Kindly arrange the payment. Thank you.`
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Debtors — Money to Collect</h1>
          <p className="text-sm text-gray-500 mt-0.5">Customers who owe you (live ledger balance) · tap the number to call</p>
        </div>
        <Button variant="secondary" onClick={exportExcel} disabled={rows.length === 0}>⬇ Export Excel</Button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-50 rounded-xl p-4"><p className="text-xs text-red-500 font-medium">Total to Collect</p><p className="text-xl font-bold text-red-900">{formatCurrency(total)}</p></div>
        <div className="bg-blue-50 rounded-xl p-4"><p className="text-xs text-blue-500 font-medium">Parties</p><p className="text-xl font-bold text-blue-900">{rows.length}</p></div>
      </div>

      {/* Search */}
      <Card><SearchBox onSearch={handleSearch} /></Card>

      {/* Table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 text-left">Bill No</th>
                <th className="px-4 py-3 text-left">Name &amp; Place</th>
                <th className="px-4 py-3 text-right">Ledger Amount</th>
                <th className="px-4 py-3 text-left">Bill Date</th>
                <th className="px-4 py-3 text-left">Contact</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-10 text-gray-400">No customers with an outstanding balance 🎉</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-blue-600">{r.billNo || '—'}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-900">{r.name}</p>
                    {r.place && <p className="text-xs text-gray-400">{r.place}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-red-600 whitespace-nowrap">{formatCurrency(r.amount)}</td>
                  <td className="px-4 py-2.5 text-gray-500">{r.billDate ? formatDate(r.billDate) : '—'}</td>
                  <td className="px-4 py-2.5">
                    {r.phone ? (
                      <div className="flex items-center gap-2">
                        <a href={`tel:${r.phone}`} className="text-blue-600 font-medium hover:underline whitespace-nowrap">📞 {r.phone}</a>
                        <a href={`https://wa.me/91${r.phone}?text=${waMessage(r)}`} target="_blank" rel="noopener noreferrer" className="text-green-600" title="Send WhatsApp reminder">💬</a>
                      </div>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-2.5 text-gray-700" colSpan="2">Total · {rows.length} parties</td>
                  <td className="px-4 py-2.5 text-right text-red-700">{formatCurrency(total)}</td>
                  <td className="px-4 py-2.5" colSpan="2" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
