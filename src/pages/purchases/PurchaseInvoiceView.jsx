import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useInvoices } from '../../context/InvoiceContext';
import { useLedger } from '../../context/LedgerContext';
import { Button, Badge, Card, Modal, Input, Select, useToast, Toast } from '../../components/ui';
import { formatCurrency, formatDate, today } from '../../utils/helpers';

const payColor = { paid: 'green', partial: 'yellow', unpaid: 'red' };
const statusColor = { draft: 'gray', issued: 'blue', paid: 'green', void: 'red' };

export default function PurchaseInvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { getPurchaseInvoice, updatePurchaseInvoice } = useInvoices();
  const { addPaymentOut, addPurchaseReturn } = useLedger();

  const inv = getPurchaseInvoice(id);

  const [payOpen, setPayOpen] = useState(false);
  const [retOpen, setRetOpen] = useState(false);
  const [payForm, setPayForm] = useState({ date: today(), amount: '', method: 'cash', notes: '' });
  const [retForm, setRetForm] = useState({ date: today(), amount: '', notes: '' });

  if (!inv) return <div className="p-8 text-center text-gray-400">Invoice not found.</div>;

  const remaining = inv.grandTotal - (inv.amountPaid || 0);

  const markPaid = () => {
    const rem = remaining;
    updatePurchaseInvoice(id, { paymentStatus: 'paid', amountPaid: inv.grandTotal, status: 'paid', paymentDate: today() });
    if (rem > 0.01) {
      addPaymentOut({ supplierId: inv.supplierId, supplierName: inv.supplierName, date: today(), amount: rem, method: inv.paymentMethod || 'cash', referenceId: id, referenceNo: inv.invoiceNumber, narration: `Full payment — ${inv.invoiceNumber}` });
    }
  };

  const handleRecordPayment = () => {
    if (!payForm.amount || +payForm.amount <= 0) { toast.error('Enter a valid amount'); return; }
    const amt = +payForm.amount;
    const newPaid = (inv.amountPaid || 0) + amt;
    const newStatus = newPaid >= inv.grandTotal - 0.01 ? 'paid' : 'partial';
    updatePurchaseInvoice(id, { amountPaid: newPaid, paymentStatus: newStatus, paymentMethod: payForm.method, paymentDate: payForm.date });
    addPaymentOut({ supplierId: inv.supplierId, supplierName: inv.supplierName, date: payForm.date, amount: amt, method: payForm.method, referenceId: id, referenceNo: inv.invoiceNumber, narration: payForm.notes || `Payment made — ${inv.invoiceNumber} (${payForm.method})` });
    toast.success(`₹${amt.toLocaleString('en-IN')} recorded`);
    setPayOpen(false);
    setPayForm({ date: today(), amount: '', method: 'cash', notes: '' });
  };

  const handlePurchaseReturn = () => {
    if (!retForm.amount || +retForm.amount <= 0) { toast.error('Enter a valid amount'); return; }
    addPurchaseReturn({ supplierId: inv.supplierId, supplierName: inv.supplierName, date: retForm.date, amount: +retForm.amount, referenceId: id, referenceNo: inv.invoiceNumber, narration: retForm.notes || `Purchase Return — ${inv.invoiceNumber}` });
    toast.success('Purchase return recorded in ledger');
    setRetOpen(false);
    setRetForm({ date: today(), amount: '', notes: '' });
  };

  return (
    <>
      <Toast toasts={toast.toasts} remove={toast.remove} />
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/purchases')} className="text-gray-400 hover:text-gray-600">←</button>
          <h1 className="text-2xl font-bold text-gray-900">{inv.invoiceNumber}</h1>
          <Badge color={statusColor[inv.status]}>{inv.status}</Badge>
          <Badge color={payColor[inv.paymentStatus]}>{inv.paymentStatus}</Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          {inv.supplierId && <Link to={`/suppliers/${inv.supplierId}/ledger`}><Button variant="secondary">📗 Ledger</Button></Link>}
          <Button variant="secondary" onClick={() => navigate(`/purchases/${id}/edit`)}>Edit</Button>
          {inv.status !== 'void' && remaining > 0.01 && (
            <Button variant="success" onClick={() => { setPayForm(f => ({ ...f, amount: remaining.toFixed(2) })); setPayOpen(true); }}>
              + Record Payment
            </Button>
          )}
          {inv.status !== 'void' && <Button variant="outline" onClick={() => setRetOpen(true)}>↩ Return</Button>}
          {inv.paymentStatus !== 'paid' && inv.status !== 'void' && <Button variant="success" onClick={markPaid}>✓ Mark Paid</Button>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <Card>
          <p className="text-xs text-gray-500 uppercase mb-2">Supplier</p>
          <p className="font-semibold">{inv.supplierName}</p>
          {inv.supplierInvoiceNumber && <p className="text-sm text-gray-500 mt-1">Ref: {inv.supplierInvoiceNumber}</p>}
        </Card>
        <Card>
          <div className="space-y-2 text-sm">
            <div><p className="text-xs text-gray-500">Date</p><p className="font-medium">{formatDate(inv.date)}</p></div>
            <div><p className="text-xs text-gray-500">Payment Method</p><p className="font-medium capitalize">{inv.paymentMethod || '—'}</p></div>
          </div>
        </Card>
        <Card>
          <p className="text-xs text-gray-500 uppercase mb-2">Payment</p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-semibold">{formatCurrency(inv.grandTotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Paid</span><span className="text-green-600 font-semibold">{formatCurrency(inv.amountPaid || 0)}</span></div>
            {remaining > 0.01 && (
              <div className="flex justify-between border-t pt-1"><span className="text-red-600 font-medium">Balance</span><span className="text-red-600 font-bold">{formatCurrency(remaining)}</span></div>
            )}
          </div>
        </Card>
      </div>

      <Card padding={false}>
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
            <th className="px-4 py-3 text-left">#</th>
            <th className="px-4 py-3 text-left">Product</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3 text-right">Cost</th>
            <th className="px-4 py-3 text-right">GST</th>
            <th className="px-4 py-3 text-right">Total</th>
          </tr></thead>
          <tbody>{(inv.items||[]).map((item, i) => (
            <tr key={i} className="border-b">
              <td className="px-4 py-3 text-gray-400">{i+1}</td>
              <td className="px-4 py-3">
                <p className="font-medium">{item.productName}</p>
                {item.sku && <p className="text-xs text-blue-500 font-mono mt-0.5">#{item.sku}</p>}
              </td>
              <td className="px-4 py-3 text-right">{item.quantity} {item.unit}</td>
              <td className="px-4 py-3 text-right">{formatCurrency(item.unitPrice)}</td>
              <td className="px-4 py-3 text-right text-gray-500">{item.gstRate}%</td>
              <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.lineTotal)}</td>
            </tr>
          ))}</tbody>
        </table>
        <div className="flex justify-end p-5 border-t">
          <div className="w-56 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(inv.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">GST</span><span>{formatCurrency(inv.totalGST)}</span></div>
            <div className="flex justify-between font-bold text-base border-t pt-2"><span>Grand Total</span><span className="text-green-700">{formatCurrency(inv.grandTotal)}</span></div>
            {(inv.amountPaid || 0) > 0 && <div className="flex justify-between text-green-600"><span>Paid</span><span>{formatCurrency(inv.amountPaid)}</span></div>}
            {remaining > 0.01 && <div className="flex justify-between font-semibold text-red-600"><span>Balance Due</span><span>{formatCurrency(remaining)}</span></div>}
          </div>
        </div>
      </Card>
    </div>

    {/* Record Payment Modal */}
    <Modal open={payOpen} onClose={() => setPayOpen(false)} title={`Record Payment — ${inv.invoiceNumber}`}>
      <div className="space-y-4">
        <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
          Balance due: <strong>{formatCurrency(remaining)}</strong>
        </div>
        <Input label="Date *" type="date" value={payForm.date} onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} />
        <Input label="Amount (₹) *" type="number" min="0.01" step="0.01" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
        <Select label="Payment Method" value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}>
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="bank">Bank Transfer</option>
          <option value="cheque">Cheque</option>
        </Select>
        <Input label="Notes (optional)" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Partial payment" />
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="secondary" onClick={() => setPayOpen(false)}>Cancel</Button>
          <Button variant="success" onClick={handleRecordPayment}>✓ Record Payment</Button>
        </div>
      </div>
    </Modal>

    {/* Purchase Return Modal */}
    <Modal open={retOpen} onClose={() => setRetOpen(false)} title={`Purchase Return — ${inv.invoiceNumber}`}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">This will debit the supplier's ledger — reduces what we owe them.</p>
        <Input label="Date *" type="date" value={retForm.date} onChange={e => setRetForm(f => ({ ...f, date: e.target.value }))} />
        <Input label="Return Amount (₹) *" type="number" min="0.01" step="0.01" value={retForm.amount} onChange={e => setRetForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
        <Input label="Reason / Notes" value={retForm.notes} onChange={e => setRetForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Damaged goods" />
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="secondary" onClick={() => setRetOpen(false)}>Cancel</Button>
          <Button onClick={handlePurchaseReturn}>↩ Record Return</Button>
        </div>
      </div>
    </Modal>
    </>
  );
}
