import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useInvoices } from '../../context/InvoiceContext';
import { useProducts } from '../../context/ProductContext';
import { useSuppliers } from '../../context/SupplierContext';
import { api } from '../../hooks/useApi';
import { Button, Badge, Card, Modal, Input, Select, useToast, Toast } from '../../components/ui';
import { formatCurrency, formatDate, today } from '../../utils/helpers';

const payColor = { paid: 'green', partial: 'yellow', unpaid: 'red' };
const statusColor = { draft: 'gray', issued: 'blue', paid: 'green', void: 'red' };

export default function PurchaseInvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { getPurchaseInvoice, updatePurchaseInvoiceLocal, deletePurchaseInvoice } = useInvoices();
  const { get: getProduct } = useProducts();
  const { get: getSupplier } = useSuppliers();

  const inv = getPurchaseInvoice(id);

  const [payOpen, setPayOpen] = useState(false);
  const [retOpen, setRetOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [labelQtys, setLabelQtys] = useState([]);
  const [payForm, setPayForm] = useState({ date: today(), amount: '', method: 'cash', notes: '' });
  const [retForm, setRetForm] = useState({ date: today(), amount: '', notes: '' });

  if (!inv) return <div className="p-8 text-center text-gray-400">Invoice not found.</div>;

  const remaining   = inv.grandTotal - (inv.amountPaid || 0);
  const supplier    = getSupplier(inv.supplierId);
  const vendorCode  = supplier ? (supplier.code || supplier.name.replace(/\s+/g,'').slice(0,4).toUpperCase()) : null;
  const totalQty    = (inv.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);

  const openLabelModal = () => {
    setLabelQtys((inv.items || []).map(item => ({ ...item, labelQty: item.quantity || 1 })));
    setLabelOpen(true);
  };

  const handleDelete = async () => {
    try {
      await deletePurchaseInvoice(id);
      toast.success('Invoice deleted · Stock & ledger reversed');
      setTimeout(() => navigate('/purchases'), 400);
    } catch (e) { toast.error(e.message); }
  };

  const printLabels = () => {
    const items = labelQtys
      .filter(item => (item.labelQty || 0) > 0 && item.productId)
      .map(item => {
        const product = getProduct(item.productId);
        return { product, qty: item.labelQty, supplier: null };
      })
      .filter(i => i.product);
    if (!items.length) { toast.error('No valid items to print'); return; }
    setLabelOpen(false);
    navigate('/labels/bulk', { state: { items } });
  };

  const markPaid = async () => {
    try {
      const updated = await api(`/purchases/${id}/mark-paid`, { method: 'PATCH' });
      updatePurchaseInvoiceLocal(id, updated);
    } catch (e) { toast.error(e.message); }
  };

  const handleRecordPayment = async () => {
    if (!payForm.amount || +payForm.amount <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      const updated = await api(`/purchases/${id}/payment`, {
        method: 'POST',
        body: { date: payForm.date, amount: +payForm.amount, method: payForm.method, notes: payForm.notes },
      });
      updatePurchaseInvoiceLocal(id, updated);
      toast.success(`₹${(+payForm.amount).toLocaleString('en-IN')} recorded`);
      setPayOpen(false);
      setPayForm({ date: today(), amount: '', method: 'cash', notes: '' });
    } catch (e) { toast.error(e.message); }
  };

  const handlePurchaseReturn = async () => {
    if (!retForm.amount || +retForm.amount <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      await api(`/purchases/${id}/return`, {
        method: 'POST',
        body: { date: retForm.date, amount: +retForm.amount, notes: retForm.notes },
      });
      toast.success('Purchase return recorded in ledger');
      setRetOpen(false);
      setRetForm({ date: today(), amount: '', notes: '' });
    } catch (e) { toast.error(e.message); }
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
          <Button variant="secondary" onClick={openLabelModal}>🏷 Print Labels</Button>
          <Button variant="secondary" onClick={() => navigate(`/purchases/${id}/edit`)}>Edit</Button>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>🗑 Delete</Button>
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
          <p className="font-semibold">{inv.supplierName}{vendorCode ? ` (${vendorCode})` : ''}</p>
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
            <div className="flex justify-between"><span className="text-gray-500">Total Qty</span><span className="font-medium">{totalQty} pcs</span></div>
            {(inv.billDiscount || 0) > 0 && (
              <div className="flex justify-between"><span className="text-gray-500">Discount</span><span className="text-orange-600 font-medium">− {formatCurrency(inv.billDiscount)}</span></div>
            )}
            {(inv.otherCharges || 0) > 0 && (
              <div className="flex justify-between"><span className="text-gray-500">{inv.otherChargesNarration || 'Other Charges'}</span><span className="text-blue-600 font-medium">+ {formatCurrency(inv.otherCharges)}</span></div>
            )}
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
                {item.sku && (
                  <p className="text-xs text-blue-500 font-mono mt-0.5">
                    #{item.sku}{vendorCode ? ` · ${vendorCode}` : ''}
                  </p>
                )}
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
            <div className="flex justify-between"><span className="text-gray-500">Total Qty</span><span className="font-medium">{totalQty} pcs</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(inv.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">GST</span><span>{formatCurrency(inv.totalGST)}</span></div>
            {(inv.billDiscount || 0) > 0 && (
              <div className="flex justify-between text-orange-600"><span>Bill Discount</span><span>− {formatCurrency(inv.billDiscount)}</span></div>
            )}
            {(inv.otherCharges || 0) > 0 && (
              <div className="flex justify-between text-blue-600"><span>{inv.otherChargesNarration || 'Other Charges'}</span><span>+ {formatCurrency(inv.otherCharges)}</span></div>
            )}
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

    {/* Delete Confirm Modal */}
    <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete Invoice">
      <div className="space-y-4">
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <p className="font-semibold">This will permanently delete <strong>{inv.invoiceNumber}</strong> and:</p>
          <ul className="mt-2 list-disc list-inside space-y-1 text-red-600">
            <li>Reverse stock for all {(inv.items || []).length} item(s)</li>
            <li>Remove all ledger entries for this invoice</li>
            <li>Reverse supplier balance</li>
          </ul>
        </div>
        <p className="text-sm text-gray-500">This action cannot be undone.</p>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Yes, Delete Invoice
          </button>
        </div>
      </div>
    </Modal>

    {/* Print Labels Modal */}
    <Modal open={labelOpen} onClose={() => setLabelOpen(false)} title={`Print Labels — ${inv.invoiceNumber}`}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Set the number of stickers to print for each item.</p>
        <div className="space-y-2">
          {labelQtys.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{item.productName}</p>
                {item.sku && <p className="text-xs text-blue-500 font-mono mt-0.5">#{item.sku}</p>}
                <p className="text-xs text-gray-400 mt-0.5">Purchased: {item.quantity} {item.unit}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setLabelQtys(prev => prev.map((it, i) => i === idx ? { ...it, labelQty: Math.max(0, it.labelQty - 1) } : it))}
                  className="w-7 h-7 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 text-base font-bold flex items-center justify-center select-none"
                >−</button>
                <input
                  type="number" min="0"
                  value={item.labelQty}
                  onChange={e => setLabelQtys(prev => prev.map((it, i) => i === idx ? { ...it, labelQty: Math.max(0, +e.target.value || 0) } : it))}
                  className="w-14 text-center border border-gray-300 rounded-lg px-1 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  onClick={() => setLabelQtys(prev => prev.map((it, i) => i === idx ? { ...it, labelQty: it.labelQty + 1 } : it))}
                  className="w-7 h-7 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 text-base font-bold flex items-center justify-center select-none"
                >+</button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center pt-2 border-t">
          <p className="text-sm text-gray-500">
            Total: <strong>{labelQtys.reduce((s, i) => s + (i.labelQty || 0), 0)}</strong> labels
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setLabelOpen(false)}>Cancel</Button>
            <Button onClick={printLabels}>🏷 Print Labels</Button>
          </div>
        </div>
      </div>
    </Modal>
    </>
  );
}
