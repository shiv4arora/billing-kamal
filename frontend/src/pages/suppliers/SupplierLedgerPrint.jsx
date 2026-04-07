import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useSuppliers } from '../../context/SupplierContext';
import { useLedger } from '../../context/LedgerContext';
import { useSettings } from '../../context/SettingsContext';
import { formatCurrency, formatDate, today } from '../../utils/helpers';

const TYPE_LABEL = {
  purchase_invoice: 'Purchase Invoice',
  payment_out:      'Payment Made',
  purchase_return:  'Purchase Return',
  adjustment:       'Adjustment',
};

export default function SupplierLedgerPrint() {
  const { id } = useParams();
  const { get } = useSuppliers();
  const { getEntriesByParty } = useLedger();
  const { settings } = useSettings();

  const [rawEntries, setRawEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const supplier = get(id);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getEntriesByParty('supplier', id)
      .then(data => setRawEntries(data || []))
      .catch(() => setRawEntries([]))
      .finally(() => setLoading(false));
  }, [id]);

  // Compute running balance — supplier: credit increases liability
  const entries = rawEntries.reduce((acc, e) => {
    const prev = acc.length ? acc[acc.length - 1].runBal : 0;
    return [...acc, { ...e, runBal: prev + (e.credit || 0) - (e.debit || 0) }];
  }, []);

  const totalDr = rawEntries.reduce((s, e) => s + (e.debit || 0), 0);
  const totalCr = rawEntries.reduce((s, e) => s + (e.credit || 0), 0);
  // positive = we owe supplier (Cr/payable)
  const balance = totalCr - totalDr;

  if (!supplier) return <div className="p-8 text-center">Supplier not found.</div>;

  const { company } = settings;
  const printDate = formatDate(today());

  return (
    <div className="min-h-screen bg-white font-sans">
      <style>{`
        @media print {
          html, body {
            background: white !important;
            color: black !important;
            color-scheme: light !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print { display: none !important; }
          @page { margin: 12mm 14mm; size: A4; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print p-4 bg-gray-800 flex items-center gap-3">
        <button
          onClick={() => window.print()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium"
        >
          🖨 Print / Save PDF
        </button>
        <button
          onClick={() => window.history.back()}
          className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-lg text-sm"
        >
          ← Back
        </button>
        <span className="text-gray-400 text-sm ml-2">
          Tip: In the print dialog, choose "Save as PDF" to export.
        </span>
      </div>

      {/* Printable content */}
      <div className="p-8 max-w-[210mm] mx-auto text-[12px] text-gray-900">

        {/* Header */}
        <div className="flex justify-between items-start pb-4 border-b-2 border-gray-800 mb-5">
          <div>
            {company.logo && <img src={company.logo} alt="logo" className="h-10 mb-1" />}
            <h1 className="text-lg font-bold text-gray-900">{company.name}</h1>
            {company.address && <p className="text-gray-500 whitespace-pre-line text-[11px]">{company.address}</p>}
            {company.phone  && <p className="text-gray-500 text-[11px]">Ph: {company.phone}</p>}
            {company.gstin  && <p className="text-gray-500 text-[11px]">GSTIN: {company.gstin}</p>}
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-gray-900 uppercase tracking-wide">Supplier Ledger</p>
            <p className="text-gray-500 mt-1 text-[11px]">Printed: {printDate}</p>
          </div>
        </div>

        {/* Supplier info */}
        <div className="mb-5 flex justify-between items-start">
          <div>
            <p className="text-[10px] font-semibold uppercase text-gray-400 mb-1">Supplier Account</p>
            <p className="text-base font-bold text-gray-900">{supplier.name}</p>
            {supplier.place         && <p className="text-gray-500 text-[11px]">📍 {supplier.place}</p>}
            {supplier.phone         && <p className="text-gray-500 text-[11px]">📞 {supplier.phone}</p>}
            {supplier.contactPerson && <p className="text-gray-500 text-[11px]">Contact: {supplier.contactPerson}</p>}
            {supplier.gstin         && <p className="text-gray-500 text-[11px]">GSTIN: {supplier.gstin}</p>}
          </div>
          {/* Balance summary box */}
          <div className="border-2 border-gray-800 rounded-lg px-5 py-3 text-right min-w-[160px]">
            <p className="text-[10px] font-semibold uppercase text-gray-500 mb-2">Account Summary</p>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between gap-6">
                <span className="text-gray-500">Payments Made (Dr)</span>
                <span className="font-semibold">{formatCurrency(totalDr)}</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-gray-500">Total Purchases (Cr)</span>
                <span className="font-semibold">{formatCurrency(totalCr)}</span>
              </div>
              <div className="flex justify-between gap-6 border-t pt-1 mt-1">
                <span className="font-bold text-gray-800">
                  {balance > 0.01 ? 'Payable' : balance < -0.01 ? 'Advance Paid' : 'Balance'}
                </span>
                <span className={`font-bold text-[12px] ${balance > 0.01 ? 'text-red-700' : balance < -0.01 ? 'text-purple-700' : 'text-gray-500'}`}>
                  {Math.abs(balance) > 0.01
                    ? `${formatCurrency(Math.abs(balance))} ${balance > 0 ? 'Cr' : 'Dr'}`
                    : 'Settled'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="py-10 text-center text-gray-400 text-sm">Loading transactions...</div>
        ) : (
          <>
            {/* Ledger Table */}
            <table className="w-full border-collapse text-[11px] mb-4">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-2 text-left font-semibold w-24">Date</th>
                  <th className="border border-gray-300 px-2 py-2 text-left font-semibold w-28">Type</th>
                  <th className="border border-gray-300 px-2 py-2 text-left font-semibold">Narration</th>
                  <th className="border border-gray-300 px-2 py-2 text-left font-semibold w-24">Reference</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold w-28">Debit (Dr)</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold w-28">Credit (Cr)</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold w-28">Balance</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="border border-gray-300 px-3 py-6 text-center text-gray-400">
                      No transactions found.
                    </td>
                  </tr>
                ) : (
                  entries.map((e, i) => (
                    <tr key={e.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-300 px-2 py-1.5 whitespace-nowrap">{formatDate(e.date)}</td>
                      <td className="border border-gray-300 px-2 py-1.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          e.type === 'purchase_invoice' ? 'bg-blue-100 text-blue-800' :
                          e.type === 'payment_out'      ? 'bg-green-100 text-green-800' :
                          e.type === 'purchase_return'  ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {TYPE_LABEL[e.type] || e.type}
                        </span>
                      </td>
                      <td className="border border-gray-300 px-2 py-1.5">{e.narration}</td>
                      <td className="border border-gray-300 px-2 py-1.5 font-mono text-[10px] text-blue-700">{e.referenceNo || '—'}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-green-800">
                        {e.debit > 0 ? formatCurrency(e.debit) : '—'}
                      </td>
                      <td className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-blue-800">
                        {e.credit > 0 ? formatCurrency(e.credit) : '—'}
                      </td>
                      <td className={`border border-gray-300 px-2 py-1.5 text-right font-bold ${
                        e.runBal > 0.01 ? 'text-red-700' : e.runBal < -0.01 ? 'text-purple-700' : 'text-gray-400'
                      }`}>
                        {Math.abs(e.runBal) > 0.01
                          ? `${formatCurrency(Math.abs(e.runBal))} ${e.runBal > 0 ? 'Cr' : 'Dr'}`
                          : 'Nil'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {entries.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-200 font-bold">
                    <td colSpan="4" className="border border-gray-300 px-2 py-2 text-right text-gray-700">Grand Total</td>
                    <td className="border border-gray-300 px-2 py-2 text-right text-green-800">{formatCurrency(totalDr)}</td>
                    <td className="border border-gray-300 px-2 py-2 text-right text-blue-800">{formatCurrency(totalCr)}</td>
                    <td className={`border border-gray-300 px-2 py-2 text-right ${
                      balance > 0.01 ? 'text-red-700' : balance < -0.01 ? 'text-purple-700' : 'text-gray-500'
                    }`}>
                      {Math.abs(balance) > 0.01
                        ? `${formatCurrency(Math.abs(balance))} ${balance > 0 ? 'Cr' : 'Dr'}`
                        : 'Settled'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>

            {/* Closing balance statement */}
            <div className="flex justify-between items-end mt-6 pt-4 border-t border-gray-300">
              <div className="text-[11px] text-gray-500">
                <p>Total entries: <strong>{entries.length}</strong></p>
                <p className="mt-1">This is a computer-generated statement and does not require a signature.</p>
              </div>
              <div className={`text-right border-2 rounded-lg px-4 py-2 ${balance > 0.01 ? 'border-red-400 bg-red-50' : balance < -0.01 ? 'border-purple-400 bg-purple-50' : 'border-green-400 bg-green-50'}`}>
                <p className="text-[10px] font-semibold uppercase text-gray-500">Closing Balance</p>
                <p className={`text-base font-bold mt-0.5 ${balance > 0.01 ? 'text-red-700' : balance < -0.01 ? 'text-purple-700' : 'text-green-700'}`}>
                  {Math.abs(balance) > 0.01
                    ? `${formatCurrency(Math.abs(balance))} ${balance > 0 ? 'Credit (Payable)' : 'Debit (Advance)'}`
                    : '✓ Account Settled'}
                </p>
              </div>
            </div>
          </>
        )}

        {/* Signature row */}
        <div className="mt-10 flex justify-between text-[11px] text-gray-500">
          <div className="text-center">
            <div className="w-40 border-b border-gray-400 mb-1"></div>
            Supplier Signature
          </div>
          <div className="text-center">
            <div className="w-40 border-b border-gray-400 mb-1"></div>
            Authorised Signatory
          </div>
        </div>
      </div>
    </div>
  );
}
