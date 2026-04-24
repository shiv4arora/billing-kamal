import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useCustomers } from '../../context/CustomerContext';
import { useLedger } from '../../context/LedgerContext';
import { Card, Badge, Button, Modal, Input, Select, useToast, Toast } from '../../components/ui';
import { formatCurrency, formatDate, formatCustomerDisplay, today } from '../../utils/helpers';

const TYPE_META = {
  sale_invoice: { label: 'Sale Invoice',      color: 'blue'   },
  payment_in:   { label: 'Payment Received',  color: 'green'  },
  sale_return:  { label: 'Sale Return',        color: 'yellow' },
  adjustment:   { label: 'Adjustment',         color: 'gray'   },
};
const EDITABLE_TYPES = ['payment_in', 'sale_return', 'adjustment'];

function entryAmount(e) { return e.credit > 0 ? e.credit : e.debit; }

export default function CustomerLedger() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { get } = useCustomers();
  const { addPaymentIn, addSaleReturn, addAdjustment, editEntry, deleteEntry, getEntriesByParty, getBalance } = useLedger();

  const customer = get(id);

  const [rawEntries, setRawEntries] = useState([]);
  const [balance, setBalance]       = useState(0);

  const [payOpen, setPayOpen]  = useState(false);
  const [retOpen, setRetOpen]  = useState(false);
  const [adjOpen, setAdjOpen]  = useState(false);
  const [editEntryData, setEditEntryData] = useState(null);

  const [payForm, setPayForm] = useState({ date: today(), amount: '', method: 'cash', notes: '' });
  const [retForm, setRetForm] = useState({ date: today(), amount: '', invoiceNo: '', notes: '' });
  const [adjForm, setAdjForm] = useState({ date: today(), adjType: 'credit', amount: '', notes: '' });
  const [editForm, setEditForm] = useState({ amount: '', date: '', narration: '' });

  const refresh = async () => {
    const data = await getEntriesByParty('customer', id).catch(() => []);
    const bal  = await getBalance('customer', id).catch(() => 0);
    setRawEntries(data);
    setBalance(bal);
  };
  useEffect(() => { refresh(); }, [id]);

  const entries = rawEntries.reduce((acc, e) => {
    const prev = acc.length ? acc[acc.length - 1].runBal : 0;
    return [...acc, { ...e, runBal: prev + (e.debit || 0) - (e.credit || 0) }];
  }, []);

  const totalDr = rawEntries.reduce((s, e) => s + (e.debit || 0), 0);
  const totalCr = rawEntries.reduce((s, e) => s + (e.credit || 0), 0);

  const handlePayment = async () => {
    if (!payForm.amount || +payForm.amount <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      await addPaymentIn({ customerId: id, customerName: customer?.name || '', date: payForm.date,
        amount: +payForm.amount, method: payForm.method,
        narration: payForm.notes || `Payment received (${payForm.method})` });
      toast.success('Payment recorded');
      setPayOpen(false);
      setPayForm({ date: today(), amount: '', method: 'cash', notes: '' });
      refresh();
    } catch (e) { toast.error(e.message); }
  };

  const handleReturn = async () => {
    if (!retForm.amount || +retForm.amount <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      await addSaleReturn({ customerId: id, customerName: customer?.name || '', date: retForm.date,
        amount: +retForm.amount, referenceNo: retForm.invoiceNo,
        narration: retForm.notes || `Sale Return${retForm.invoiceNo ? ` against ${retForm.invoiceNo}` : ''}` });
      toast.success('Sale return recorded');
      setRetOpen(false);
      setRetForm({ date: today(), amount: '', invoiceNo: '', notes: '' });
      refresh();
    } catch (e) { toast.error(e.message); }
  };

  const handleAdj = async () => {
    if (!adjForm.amount || +adjForm.amount <= 0) { toast.error('Enter a valid amount'); return; }
    const isCredit = adjForm.adjType === 'credit';
    try {
      await addAdjustment({ partyType: 'customer', partyId: id, partyName: customer?.name || '',
        date: adjForm.date,
        debit: isCredit ? 0 : +adjForm.amount,
        credit: isCredit ? +adjForm.amount : 0,
        narration: adjForm.notes || 'Manual Adjustment' });
      toast.success('Adjustment recorded');
      setAdjOpen(false);
      setAdjForm({ date: today(), adjType: 'credit', amount: '', notes: '' });
      refresh();
    } catch (e) { toast.error(e.message); }
  };

  const openEdit = (e) => {
    setEditEntryData(e);
    setEditForm({ amount: String(entryAmount(e)), date: e.date, narration: e.narration });
  };

  const handleEditSave = async () => {
    if (!editForm.amount || +editForm.amount <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      await editEntry(editEntryData.id, { amount: +editForm.amount, date: editForm.date, narration: editForm.narration });
      toast.success('Entry updated');
      setEditEntryData(null);
      refresh();
    } catch (e) { toast.error(e.message); }
  };

  const handleDelete = async (e) => {
    if (!window.confirm(`Delete this ${TYPE_META[e.type]?.label || e.type} entry of ${formatCurrency(entryAmount(e))}?`)) return;
    try {
      await deleteEntry(e.id);
      toast.success('Entry deleted');
      refresh();
    } catch (err) { toast.error(err.message); }
  };

  if (!customer) return <div className="p-8 text-center text-gray-400">Customer not found.</div>;

  return (
    <>
      <Toast toasts={toast.toasts} remove={toast.remove} />

      <div className="max-w-5xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/customers')} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{formatCustomerDisplay(customer)}</h1>
              <p className="text-sm text-gray-500">{customer.phone}{customer.place ? ` · ${customer.place}` : ''} · Customer Ledger</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link to={`/customers/${id}/ledger/print`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">🖨 Export PDF</Button>
            </Link>
            <Button variant="success" onClick={() => setPayOpen(true)}>+ Record Payment</Button>
            <Button variant="outline" onClick={() => setRetOpen(true)}>↩ Sale Return</Button>
            <Button variant="secondary" onClick={() => setAdjOpen(true)}>⚙ Adjust</Button>
          </div>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-xs text-blue-500 font-semibold uppercase">Total Sales (Dr)</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{formatCurrency(totalDr)}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4">
            <p className="text-xs text-green-500 font-semibold uppercase">Payments / Returns (Cr)</p>
            <p className="text-2xl font-bold text-green-900 mt-1">{formatCurrency(totalCr)}</p>
          </div>
          <div className={`rounded-xl p-4 ${balance > 0.01 ? 'bg-red-50' : balance < -0.01 ? 'bg-purple-50' : 'bg-gray-50'}`}>
            <p className={`text-xs font-semibold uppercase ${balance > 0.01 ? 'text-red-500' : balance < -0.01 ? 'text-purple-500' : 'text-gray-500'}`}>
              {balance > 0.01 ? '⚠ Receivable (Dr)' : balance < -0.01 ? 'Advance / Overpaid (Cr)' : '✓ Settled'}
            </p>
            <p className={`text-2xl font-bold mt-1 ${balance > 0.01 ? 'text-red-800' : balance < -0.01 ? 'text-purple-800' : 'text-gray-500'}`}>
              {balance !== 0 ? formatCurrency(Math.abs(balance)) : '—'}
            </p>
          </div>
        </div>

        {/* Ledger Table */}
        <Card padding={false}>
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Account Statement</h3>
            <span className="text-xs text-gray-400">{entries.length} entries</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left w-28">Date</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Narration / Ref</th>
                  <th className="px-4 py-3 text-right w-32">Debit (Dr)</th>
                  <th className="px-4 py-3 text-right w-32">Credit (Cr)</th>
                  <th className="px-4 py-3 text-right w-36">Balance</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr><td colSpan="7" className="text-center py-12 text-gray-400">No transactions yet. Issue a sale invoice to auto-populate.</td></tr>
                ) : entries.map(e => (
                  <tr key={e.id} className={`border-b hover:bg-gray-50 ${e.type === 'payment_in' ? 'bg-green-50/30' : e.type === 'sale_return' ? 'bg-yellow-50/30' : ''}`}>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(e.date)}</td>
                    <td className="px-4 py-3">
                      <Badge color={TYPE_META[e.type]?.color || 'gray'}>
                        {TYPE_META[e.type]?.label || e.type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-800">{e.narration}</p>
                      {e.referenceNo && (
                        <p className="text-xs text-blue-500 font-mono mt-0.5">
                          {e.referenceType === 'sale_invoice'
                            ? <Link to={`/sales/${e.referenceId}`} className="hover:underline">{e.referenceNo}</Link>
                            : e.referenceType === 'sale_return'
                            ? <Link to={`/sales/returns/${e.referenceId}/print`} target="_blank" rel="noopener noreferrer" className="hover:underline text-orange-500">{e.referenceNo} ↗</Link>
                            : e.referenceNo}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">
                      {e.debit > 0 ? formatCurrency(e.debit) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">
                      {e.credit > 0 ? formatCurrency(e.credit) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${e.runBal > 0.01 ? 'text-red-600' : e.runBal < -0.01 ? 'text-purple-600' : 'text-gray-400'}`}>
                      {Math.abs(e.runBal) > 0.01 ? (
                        <>{formatCurrency(Math.abs(e.runBal))} <span className="text-xs font-normal">{e.runBal > 0 ? 'Dr' : 'Cr'}</span></>
                      ) : <span className="text-gray-400 font-normal">Nil</span>}
                    </td>
                    <td className="px-4 py-3">
                      {EDITABLE_TYPES.includes(e.type) && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(e)} title="Edit" className="text-blue-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50">✏</button>
                          <button onClick={() => handleDelete(e)} title="Delete" className="text-red-300 hover:text-red-500 p-1 rounded hover:bg-red-50">🗑</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {entries.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold text-sm">
                    <td colSpan="3" className="px-4 py-3 text-gray-600 text-right">Grand Total</td>
                    <td className="px-4 py-3 text-right text-blue-700">{formatCurrency(totalDr)}</td>
                    <td className="px-4 py-3 text-right text-green-700">{formatCurrency(totalCr)}</td>
                    <td className={`px-4 py-3 text-right ${balance > 0.01 ? 'text-red-700' : balance < -0.01 ? 'text-purple-700' : 'text-gray-400'}`}>
                      {Math.abs(balance) > 0.01
                        ? <>{formatCurrency(Math.abs(balance))} <span className="text-xs font-normal">{balance > 0 ? 'Dr' : 'Cr'}</span></>
                        : 'Settled'}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>

        {/* ── Record Payment Modal ── */}
        <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Record Payment Received">
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
              Current balance: <strong>{balance > 0.01 ? formatCurrency(balance) + ' receivable' : balance < -0.01 ? formatCurrency(Math.abs(balance)) + ' advance/overpaid' : 'Settled'}</strong>
            </div>
            <Input label="Date *" type="date" value={payForm.date} onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} />
            <Input label="Amount (₹) *" type="number" min="0.01" step="0.01" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            <Select label="Payment Method" value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank">Bank Transfer</option>
              <option value="cheque">Cheque</option>
            </Select>
            <Input label="Notes (optional)" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Against invoice SI-0001" />
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="secondary" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button variant="success" onClick={handlePayment}>✓ Record Payment</Button>
            </div>
          </div>
        </Modal>

        {/* ── Sale Return Modal ── */}
        <Modal open={retOpen} onClose={() => setRetOpen(false)} title="Record Sale Return">
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Recording a return will credit the customer account (reduces their outstanding balance).</p>
            <Input label="Date *" type="date" value={retForm.date} onChange={e => setRetForm(f => ({ ...f, date: e.target.value }))} />
            <Input label="Return Amount (₹) *" type="number" min="0.01" step="0.01" value={retForm.amount} onChange={e => setRetForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            <Input label="Against Invoice # (optional)" value={retForm.invoiceNo} onChange={e => setRetForm(f => ({ ...f, invoiceNo: e.target.value }))} placeholder="e.g. SI-0001" />
            <Input label="Notes (optional)" value={retForm.notes} onChange={e => setRetForm(f => ({ ...f, notes: e.target.value }))} placeholder="Reason for return" />
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="secondary" onClick={() => setRetOpen(false)}>Cancel</Button>
              <Button onClick={handleReturn}>↩ Record Return</Button>
            </div>
          </div>
        </Modal>

        {/* ── Adjustment Modal ── */}
        <Modal open={adjOpen} onClose={() => setAdjOpen(false)} title="Manual Ledger Adjustment">
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Use this to correct rounding differences or record opening balances.</p>
            <Input label="Date *" type="date" value={adjForm.date} onChange={e => setAdjForm(f => ({ ...f, date: e.target.value }))} />
            <Select label="Adjustment Type" value={adjForm.adjType} onChange={e => setAdjForm(f => ({ ...f, adjType: e.target.value }))}>
              <option value="debit">Debit (increases what they owe)</option>
              <option value="credit">Credit (reduces what they owe / opening balance paid)</option>
            </Select>
            <Input label="Amount (₹) *" type="number" min="0.01" step="0.01" value={adjForm.amount} onChange={e => setAdjForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            <Input label="Narration *" value={adjForm.notes} onChange={e => setAdjForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Opening balance, Correction" />
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="secondary" onClick={() => setAdjOpen(false)}>Cancel</Button>
              <Button onClick={handleAdj}>Save Adjustment</Button>
            </div>
          </div>
        </Modal>

        {/* ── Edit Entry Modal ── */}
        <Modal open={!!editEntryData} onClose={() => setEditEntryData(null)} title="Edit Entry">
          {editEntryData && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                <span className="font-medium">{TYPE_META[editEntryData.type]?.label || editEntryData.type}</span>
                {' · '}current amount: <strong>{formatCurrency(entryAmount(editEntryData))}</strong>
              </div>
              <Input label="Amount (₹) *" type="number" min="0.01" step="0.01" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
              <Input label="Date *" type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} />
              <Input label="Narration" value={editForm.narration} onChange={e => setEditForm(f => ({ ...f, narration: e.target.value }))} />
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="secondary" onClick={() => setEditEntryData(null)}>Cancel</Button>
                <Button onClick={handleEditSave}>Save Changes</Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </>
  );
}
