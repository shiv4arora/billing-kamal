import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useInvoices } from '../../context/InvoiceContext';
import { useSettings } from '../../context/SettingsContext';
import { useCustomers } from '../../context/CustomerContext';
import { api } from '../../hooks/useApi';
import { Button, Badge, Card, Modal, Input, Select, useToast, Toast } from '../../components/ui';
import { formatCurrency, formatDate, amountInWords, formatCustomerDisplay, today } from '../../utils/helpers';

const payColor = { paid: 'green', partial: 'yellow', unpaid: 'red' };
const statusColor = { draft: 'gray', issued: 'blue', paid: 'green', void: 'red' };

export default function SaleInvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { getSaleInvoice, updateSaleInvoiceLocal } = useInvoices();
  const { settings } = useSettings();
  const { get: getCustomer } = useCustomers();
  const inv = getSaleInvoice(id);

  const [payOpen, setPayOpen] = useState(false);
  const [retOpen, setRetOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [payForm, setPayForm] = useState({ date: today(), amount: '', method: 'cash', notes: '' });
  const [retForm, setRetForm] = useState({ date: today(), amount: '', notes: '' });

  if (!inv) return <div className="p-8 text-center text-gray-400">Invoice not found.</div>;

  const remaining = inv.grandTotal - (inv.amountPaid || 0);

  const markPaid = async () => {
    try {
      const updated = await api(`/sales/${id}/mark-paid`, { method: 'PATCH' });
      updateSaleInvoiceLocal(id, updated);
    } catch (e) { toast.error(e.message); }
  };

  const voidInv = async () => {
    if (!confirm('Void this invoice? This will remove it from the ledger.')) return;
    try {
      const updated = await api(`/sales/${id}/void`, { method: 'PATCH' });
      updateSaleInvoiceLocal(id, updated);
      toast.success('Invoice voided · removed from ledger');
    } catch (e) { toast.error(e.message); }
  };

  const unvoidInv = async () => {
    if (!confirm('Restore this invoice? It will reappear in the ledger.')) return;
    try {
      const updated = await api(`/sales/${id}/unvoid`, { method: 'PATCH' });
      updateSaleInvoiceLocal(id, updated);
      toast.success('Invoice restored · ledger updated');
    } catch (e) { toast.error(e.message); }
  };

  const handleRecordPayment = async () => {
    if (!payForm.amount || +payForm.amount <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      const updated = await api(`/sales/${id}/payment`, {
        method: 'POST',
        body: { date: payForm.date, amount: +payForm.amount, method: payForm.method, notes: payForm.notes },
      });
      updateSaleInvoiceLocal(id, updated);
      toast.success(`₹${(+payForm.amount).toLocaleString('en-IN')} recorded`);
      setPayOpen(false);
      setPayForm({ date: today(), amount: '', method: 'cash', notes: '' });
    } catch (e) { toast.error(e.message); }
  };

  const handleSaleReturn = async () => {
    if (!retForm.amount || +retForm.amount <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      await api(`/sales/${id}/return`, {
        method: 'POST',
        body: { date: retForm.date, amount: +retForm.amount, notes: retForm.notes },
      });
      toast.success('Sale return recorded in ledger');
      setRetOpen(false);
      setRetForm({ date: today(), amount: '', notes: '' });
    } catch (e) { toast.error(e.message); }
  };

  /* ── WhatsApp ── */
  const buildWaMessage = () => {
    const customer = getCustomer(inv.customerId);
    const displayName = formatCustomerDisplay(inv.customerName, inv.customerPlace, inv.customerType);
    const itemLines = (inv.items || []).slice(0, 5).map(it =>
      `  • ${it.productName} × ${it.quantity} = ${formatCurrency(it.lineTotal)}`
    ).join('\n');
    const moreItems = (inv.items || []).length > 5 ? `\n  ...and ${(inv.items || []).length - 5} more item(s)` : '';
    const balanceLine = (inv.grandTotal - (inv.amountPaid || 0)) > 0.01
      ? `Balance Due: ${formatCurrency(inv.grandTotal - (inv.amountPaid || 0))}`
      : 'Fully Paid ✅';
    return `*${settings.company.name || 'BillingPro'}*\n*Invoice: ${inv.invoiceNumber}*\nDate: ${formatDate(inv.date)}\nCustomer: ${displayName}\n\n*Items:*\n${itemLines}${moreItems}\n\n*Total: ${formatCurrency(inv.grandTotal)}*\nPaid: ${formatCurrency(inv.amountPaid || 0)}\n${balanceLine}\n\nThank you for your business! 🙏`;
  };

  const sendWhatsApp = () => {
    const customer = getCustomer(inv.customerId);
    const phone = (customer?.phone || '').replace(/\D/g, '');
    const msg = encodeURIComponent(buildWaMessage());
    const url = phone ? `https://wa.me/91${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, '_blank');
    setWaOpen(false);
  };

  return (
    <>
      <Toast toasts={toast.toasts} remove={toast.remove} />
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/sales')} className="text-gray-400 hover:text-gray-600">←</button>
          <h1 className="text-2xl font-bold text-gray-900">{inv.invoiceNumber}</h1>
          <Badge color={statusColor[inv.status]}>{inv.status}</Badge>
          <Badge color={payColor[inv.paymentStatus]}>{inv.paymentStatus}</Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to={`/customers/${inv.customerId}/ledger`}><Button variant="secondary">📒 Ledger</Button></Link>
          <Button variant="outline" onClick={() => setWaOpen(true)}>📱 WhatsApp</Button>
          <Link to={`/sales/${id}/print`}><Button variant="outline">🖨 Print</Button></Link>
          {inv.status !== 'void' && <Link to={`/sales/${id}/edit`}><Button variant="secondary">Edit</Button></Link>}
          {inv.status !== 'void' && remaining > 0.01 && (
            <Button variant="success" onClick={() => { setPayForm(f => ({ ...f, amount: remaining.toFixed(2) })); setPayOpen(true); }}>
              + Record Payment
            </Button>
          )}
          {inv.status !== 'void' && <Button variant="outline" onClick={() => setRetOpen(true)}>↩ Return</Button>}
          {inv.paymentStatus !== 'paid' && inv.status !== 'void' && <Button variant="success" onClick={markPaid}>✓ Mark Paid</Button>}
          {inv.status !== 'void' && <Button variant="danger" onClick={voidInv}>Void</Button>}
          {inv.status === 'void' && <Button variant="success" onClick={unvoidInv}>↩ Restore Invoice</Button>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Customer */}
        <Card>
          <p className="text-xs text-gray-500 font-medium uppercase mb-2">Customer</p>
          <p className="font-semibold text-gray-900 text-base">
            {formatCustomerDisplay(inv.customerName, inv.customerPlace, inv.customerType)}
          </p>
          {inv.customerType && (
            <span className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${
              inv.customerType === 'wholesale' ? 'bg-blue-100 text-blue-700' :
              inv.customerType === 'shop' ? 'bg-purple-100 text-purple-700' :
              'bg-green-100 text-green-700'
            }`}>
              {inv.customerType === 'wholesale' ? 'Wholesale (H)' : inv.customerType === 'shop' ? 'Shop (S)' : 'Retail (E)'}
            </span>
          )}
        </Card>
        {/* Invoice dates */}
        <Card>
          <p className="text-xs text-gray-500 font-medium uppercase mb-2">Invoice</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Date</span><span className="font-medium">{formatDate(inv.date)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Due</span><span className="font-medium">{formatDate(inv.dueDate)}</span></div>
            {inv.notes && <p className="text-xs text-gray-400 pt-1 border-t italic">{inv.notes}</p>}
          </div>
        </Card>
        {/* Payment details */}
        <Card>
          <p className="text-xs text-gray-500 font-medium uppercase mb-2">Payment</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Method</span>
              <span className="font-medium capitalize">{inv.paymentMethod || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Grand Total</span>
              <span className="font-semibold text-gray-900">{formatCurrency(inv.grandTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Paid</span>
              <span className="font-semibold text-green-600">{formatCurrency(inv.amountPaid || 0)}</span>
            </div>
            {(inv.grandTotal - (inv.amountPaid || 0)) > 0.01 && (
              <div className="flex justify-between border-t pt-1">
                <span className="text-red-600 font-medium">Balance Due</span>
                <span className="font-bold text-red-600">{formatCurrency(inv.grandTotal - (inv.amountPaid || 0))}</span>
              </div>
            )}
            {inv.paymentDate && (
              <p className="text-xs text-gray-400">Paid on {formatDate(inv.paymentDate)}</p>
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
            <th className="px-4 py-3 text-right">Rate</th>
            <th className="px-4 py-3 text-right">Disc</th>
            <th className="px-4 py-3 text-right">Taxable</th>
            <th className="px-4 py-3 text-right">GST</th>
            <th className="px-4 py-3 text-right">Total</th>
          </tr></thead>
          <tbody>
            {(inv.items || []).map((item, i) => (
              <tr key={i} className="border-b">
                <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{item.productName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.sku && <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">#{item.sku}</span>}
                    {item.hsnCode && <span className="text-xs text-gray-400">HSN: {item.hsnCode}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">{item.quantity} {item.unit}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(item.unitPrice)}</td>
                <td className="px-4 py-3 text-right">{item.discountPct ? `${item.discountPct}%` : '-'}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(item.taxableAmount)}</td>
                <td className="px-4 py-3 text-right text-gray-500">{item.gstRate}%</td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end p-5 border-t">
          <div className="w-72 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(inv.subtotal)}</span></div>
            {inv.totalDiscount > 0 && <div className="flex justify-between text-red-600"><span>Discount</span><span>-{formatCurrency(inv.totalDiscount)}</span></div>}
            {inv.totalCGST > 0 && <div className="flex justify-between"><span className="text-gray-500">CGST</span><span>{formatCurrency(inv.totalCGST)}</span></div>}
            {inv.totalSGST > 0 && <div className="flex justify-between"><span className="text-gray-500">SGST</span><span>{formatCurrency(inv.totalSGST)}</span></div>}
            {inv.totalIGST > 0 && <div className="flex justify-between"><span className="text-gray-500">IGST</span><span>{formatCurrency(inv.totalIGST)}</span></div>}
            <div className="flex justify-between font-bold text-base border-t pt-2"><span>Grand Total</span><span className="text-blue-700">{formatCurrency(inv.grandTotal)}</span></div>
            {(inv.amountPaid || 0) > 0 && (
              <div className="flex justify-between text-green-600"><span>Amount Paid</span><span>{formatCurrency(inv.amountPaid)}</span></div>
            )}
            {(inv.grandTotal - (inv.amountPaid || 0)) > 0.01 && (
              <div className="flex justify-between font-semibold text-red-600"><span>Balance Due</span><span>{formatCurrency(inv.grandTotal - (inv.amountPaid || 0))}</span></div>
            )}
          </div>
        </div>
        <div className="px-5 pb-4 text-xs text-gray-500 italic">{amountInWords(inv.grandTotal)}</div>
      </Card>
    </div>

    {/* ── Record Payment Modal ── */}
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
        <Input label="Notes (optional)" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Partial payment for this invoice" />
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="secondary" onClick={() => setPayOpen(false)}>Cancel</Button>
          <Button variant="success" onClick={handleRecordPayment}>✓ Record Payment</Button>
        </div>
      </div>
    </Modal>

    {/* ── Sale Return Modal ── */}
    <Modal open={retOpen} onClose={() => setRetOpen(false)} title={`Sale Return — ${inv.invoiceNumber}`}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">This will credit the customer's ledger and reduce their outstanding balance.</p>
        <Input label="Date *" type="date" value={retForm.date} onChange={e => setRetForm(f => ({ ...f, date: e.target.value }))} />
        <Input label="Return Amount (₹) *" type="number" min="0.01" step="0.01" value={retForm.amount} onChange={e => setRetForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
        <Input label="Reason / Notes" value={retForm.notes} onChange={e => setRetForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Damaged goods returned" />
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="secondary" onClick={() => setRetOpen(false)}>Cancel</Button>
          <Button onClick={handleSaleReturn}>↩ Record Return</Button>
        </div>
      </div>
    </Modal>

    {/* ── WhatsApp Confirmation Modal ── */}
    <Modal open={waOpen} onClose={() => setWaOpen(false)} title="Send Invoice via WhatsApp">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Preview of the message that will be sent:</p>
        <pre className="bg-gray-50 border rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
          {inv && buildWaMessage()}
        </pre>
        <p className="text-xs text-gray-400">
          This will open WhatsApp with the message pre-filled for{' '}
          <strong>{formatCustomerDisplay(inv.customerName, inv.customerPlace, inv.customerType)}</strong>.
          You can review and send from WhatsApp.
        </p>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="secondary" onClick={() => setWaOpen(false)}>Cancel</Button>
          <Button onClick={sendWhatsApp}>📱 Open WhatsApp</Button>
        </div>
      </div>
    </Modal>

    </>
  );
}
