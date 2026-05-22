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

  // Check Bill
  const [checkMode, setCheckMode] = useState(false);
  const [itemChecks, setItemChecks] = useState({});
  const [itemNotes, setItemNotes] = useState({});
  const toggleCheck = (idx, val) =>
    setItemChecks(p => ({ ...p, [idx]: p[idx] === val ? null : val }));

  if (!inv) return <div className="p-8 text-center text-gray-400">Invoice not found.</div>;

  const remaining   = inv.grandTotal - (inv.amountPaid || 0);
  const supplier    = getSupplier(inv.supplierId);
  const vendorCode  = supplier ? (supplier.code || supplier.name.replace(/\s+/g,'').slice(0,4).toUpperCase()) : null;
  const totalQty    = (inv.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);

  const openLabelModal = () => {
    setLabelQtys((inv.items || []).map(item => ({ ...item, labelQty: item.quantity || 1, selected: true })));
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
      .filter(item => item.selected && (item.labelQty || 0) > 0 && item.productId)
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
    <div className="max-w-4xl space-y-4">

      {/* ── MOBILE HEADER ─────────────────────────────────────────── */}
      <div className="lg:hidden space-y-3">
        {/* Title row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => navigate('/purchases')} className="text-gray-400 p-1 -ml-1 shrink-0">←</button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-lg font-bold text-gray-900">{inv.invoiceNumber}</h1>
                <Badge color={statusColor[inv.status]}>{inv.status}</Badge>
                <Badge color={payColor[inv.paymentStatus]}>{inv.paymentStatus}</Badge>
              </div>
              <p className="text-xs text-gray-400 truncate">
                {formatDate(inv.date)} · {supplier?.name || inv.supplierName}{vendorCode ? ` (${vendorCode})` : ''}
              </p>
            </div>
          </div>
          <button onClick={openLabelModal} className="shrink-0 p-2 text-gray-600 bg-gray-100 rounded-lg text-base active:bg-gray-200">🏷</button>
        </div>

        {/* Total / Balance tiles */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-0.5">Total</p>
            <p className="font-bold text-gray-900 text-base">{formatCurrency(inv.grandTotal)}</p>
            {(inv.amountPaid || 0) > 0 && <p className="text-xs text-green-600 mt-0.5">Paid {formatCurrency(inv.amountPaid)}</p>}
          </div>
          {remaining > 0.01 ? (
            <div className="bg-red-50 rounded-xl p-3">
              <p className="text-xs text-red-400 mb-0.5">Balance Due</p>
              <p className="font-bold text-red-600 text-base">{formatCurrency(remaining)}</p>
            </div>
          ) : (
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-xs text-green-500 mb-0.5">Payment</p>
              <p className="font-bold text-green-600">Fully Paid ✓</p>
            </div>
          )}
        </div>

        {/* Primary actions */}
        {inv.status !== 'void' && (remaining > 0.01 || inv.paymentStatus !== 'paid') && (
          <div className="flex gap-2">
            {remaining > 0.01 && (
              <button onClick={() => { setPayForm(f => ({ ...f, amount: remaining.toFixed(2) })); setPayOpen(true); }}
                className="flex-1 py-3 bg-green-600 text-white text-sm font-semibold rounded-xl active:bg-green-700">
                + Record Payment
              </button>
            )}
            {inv.paymentStatus !== 'paid' && (
              <button onClick={markPaid}
                className="flex-1 py-3 bg-green-100 text-green-700 text-sm font-semibold rounded-xl active:bg-green-200">
                ✓ Mark Paid
              </button>
            )}
          </div>
        )}

        {/* Secondary actions */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
          <button
            onClick={() => { setCheckMode(v => !v); setItemChecks({}); }}
            className={`shrink-0 px-3 py-2 text-xs rounded-lg font-medium whitespace-nowrap ${checkMode ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 active:bg-blue-100'}`}>
            {checkMode ? '✕ End Check' : '🔍 Check Bill'}
          </button>
          {inv.supplierId && (
            <Link to={`/suppliers/${inv.supplierId}/ledger`}>
              <button className="shrink-0 px-3 py-2 text-xs text-gray-600 bg-gray-100 rounded-lg font-medium active:bg-gray-200 whitespace-nowrap">📗 Ledger</button>
            </Link>
          )}
          <button onClick={() => navigate(`/purchases/${id}/edit`)}
            className="shrink-0 px-3 py-2 text-xs text-gray-600 bg-gray-100 rounded-lg font-medium active:bg-gray-200">✏️ Edit</button>
          {inv.status !== 'void' && (
            <button onClick={() => setRetOpen(true)}
              className="shrink-0 px-3 py-2 text-xs text-gray-600 bg-gray-100 rounded-lg font-medium active:bg-gray-200 whitespace-nowrap">↩ Return</button>
          )}
          <button onClick={() => setDeleteOpen(true)}
            className="shrink-0 px-3 py-2 text-xs text-red-500 bg-red-50 rounded-lg font-medium active:bg-red-100">🗑 Delete</button>
        </div>
      </div>

      {/* ── DESKTOP HEADER ────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/purchases')} className="text-gray-400 hover:text-gray-600">←</button>
          <h1 className="text-2xl font-bold text-gray-900">{inv.invoiceNumber}</h1>
          <Badge color={statusColor[inv.status]}>{inv.status}</Badge>
          <Badge color={payColor[inv.paymentStatus]}>{inv.paymentStatus}</Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant={checkMode ? 'primary' : 'outline'} onClick={() => { setCheckMode(v => !v); setItemChecks({}); }}>
            {checkMode ? '✕ End Check' : '🔍 Check Bill'}
          </Button>
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

      {/* ── MOBILE INFO CARD ──────────────────────────────────────── */}
      <div className="lg:hidden bg-white border border-gray-200 rounded-xl p-4 text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-400">Supplier</span>
          <span className="font-semibold text-gray-900 text-right ml-4">
            {supplier?.name || inv.supplierName}{vendorCode ? ` (${vendorCode})` : ''}
          </span>
        </div>
        {inv.supplierInvoiceNumber && (
          <div className="flex justify-between">
            <span className="text-gray-400">Ref #</span>
            <span className="font-medium">{inv.supplierInvoiceNumber}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-400">Date</span>
          <span className="font-medium">{formatDate(inv.date)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Payment</span>
          <span className="font-medium capitalize">{inv.paymentMethod || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Total Qty</span>
          <span className="font-medium">{totalQty} pcs</span>
        </div>
      </div>

      {/* ── DESKTOP INFO CARDS ────────────────────────────────────── */}
      <div className="hidden lg:grid grid-cols-3 gap-5">
        <Card>
          <p className="text-xs text-gray-500 uppercase mb-2">Supplier</p>
          <p className="font-semibold">{supplier?.name || inv.supplierName}{vendorCode ? ` (${vendorCode})` : ''}</p>
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

      {/* ── MOBILE ITEMS ──────────────────────────────────────────── */}
      <Card padding={false} className="lg:hidden">
        {checkMode && (() => {
          const items = inv.items || [];
          const ok = items.filter((_, i) => itemChecks[i] === 'ok').length;
          const wrong = items.filter((_, i) => itemChecks[i] === 'wrong').length;
          const pending = items.length - ok - wrong;
          return (
            <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-100">
              <span className="text-sm font-semibold text-blue-700">🔍 Checking bill…</span>
              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="text-green-600">{ok} ✓</span>
                <span className="text-red-500">{wrong} ✗</span>
                {pending > 0 && <span className="text-gray-400">{pending} left</span>}
              </div>
            </div>
          );
        })()}
        <div className="divide-y divide-gray-100">
          {(inv.items || []).map((item, i) => {
            const checkState = itemChecks[i];
            return (
              <div key={i} className={`px-4 py-3 transition-colors ${checkState === 'ok' ? 'bg-green-50' : checkState === 'wrong' ? 'bg-red-50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 text-sm">{item.productName}</p>
                    {item.sku && <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded mt-0.5 inline-block">#{item.sku}</span>}
                  </div>
                  <p className="font-semibold text-gray-900 text-sm shrink-0">{formatCurrency(item.lineTotal)}</p>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {item.quantity} {item.unit} × {formatCurrency(item.unitPrice)}
                  {item.gstRate ? ` + ${item.gstRate}% GST` : ''}
                  {item.pricing?.wholesale ? ` · W: ${formatCurrency(item.pricing.wholesale)}` : ''}
                </p>
                {checkMode && (
                  <>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => toggleCheck(i, 'ok')}
                        className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${checkState === 'ok' ? 'bg-green-500 text-white' : 'bg-white border border-green-300 text-green-600 active:bg-green-50'}`}>
                        ✓ Correct
                      </button>
                      <button onClick={() => toggleCheck(i, 'wrong')}
                        className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${checkState === 'wrong' ? 'bg-red-500 text-white' : 'bg-white border border-red-300 text-red-500 active:bg-red-50'}`}>
                        ✗ Wrong
                      </button>
                    </div>
                    {checkState === 'wrong' && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs font-bold text-red-500 bg-red-100 rounded-full w-6 h-6 flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <input
                          value={itemNotes[i] || ''}
                          onChange={e => setItemNotes(p => ({ ...p, [i]: e.target.value }))}
                          placeholder="Note what's wrong…"
                          className="flex-1 border border-red-200 bg-red-50 rounded-lg px-3 py-2 text-xs text-red-700 placeholder:text-red-300 focus:outline-none focus:ring-1 focus:ring-red-400"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="p-4 border-t space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Total Qty</span><span>{totalQty} pcs</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(inv.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">GST</span><span>{formatCurrency(inv.totalGST)}</span></div>
          {(inv.billDiscount || 0) > 0 && <div className="flex justify-between text-orange-600"><span>Bill Discount</span><span>− {formatCurrency(inv.billDiscount)}</span></div>}
          {(inv.otherCharges || 0) > 0 && <div className="flex justify-between text-blue-600"><span>{inv.otherChargesNarration || 'Other Charges'}</span><span>+ {formatCurrency(inv.otherCharges)}</span></div>}
          <div className="flex justify-between font-bold text-base border-t pt-2"><span>Grand Total</span><span className="text-green-700">{formatCurrency(inv.grandTotal)}</span></div>
          {(inv.amountPaid || 0) > 0 && <div className="flex justify-between text-green-600"><span>Paid</span><span>{formatCurrency(inv.amountPaid)}</span></div>}
          {remaining > 0.01 && <div className="flex justify-between font-semibold text-red-600"><span>Balance Due</span><span>{formatCurrency(remaining)}</span></div>}
        </div>
      </Card>

      {/* ── DESKTOP ITEMS TABLE ───────────────────────────────────── */}
      <Card padding={false} className="hidden lg:block">
        {checkMode && (() => {
          const items = inv.items || [];
          const ok = items.filter((_, i) => itemChecks[i] === 'ok').length;
          const wrong = items.filter((_, i) => itemChecks[i] === 'wrong').length;
          const pending = items.length - ok - wrong;
          return (
            <div className="flex items-center justify-between px-5 py-2.5 bg-blue-50 border-b border-blue-100">
              <span className="text-sm font-semibold text-blue-700">🔍 Checking bill…</span>
              <div className="flex items-center gap-4 text-sm font-semibold">
                <span className="text-green-600">{ok} ✓ correct</span>
                <span className="text-red-500">{wrong} ✗ wrong</span>
                {pending > 0 && <span className="text-gray-400">{pending} unchecked</span>}
              </div>
            </div>
          );
        })()}
        <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
            <th className="px-4 py-3 text-left">#</th>
            <th className="px-4 py-3 text-left">Product</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3 text-right">Cost</th>
            <th className="px-4 py-3 text-right">Wholesale</th>
            <th className="px-4 py-3 text-right">GST</th>
            <th className="px-4 py-3 text-right">Total</th>
            {checkMode && <th className="px-4 py-3 text-center w-36">Check</th>}
          </tr></thead>
          <tbody>{(inv.items||[]).map((item, i) => {
            const checkState = itemChecks[i];
            return (
              <tr key={i} className={`border-b transition-colors ${checkState === 'ok' ? 'bg-green-50' : checkState === 'wrong' ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                <td className="px-4 py-3 text-gray-400">{i+1}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{item.productName}</p>
                  {item.sku && <p className="text-xs text-blue-500 font-mono mt-0.5">#{item.sku}{vendorCode ? ` · ${vendorCode}` : ''}</p>}
                </td>
                <td className="px-4 py-3 text-right">{item.quantity} {item.unit}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(item.unitPrice)}</td>
                <td className="px-4 py-3 text-right text-blue-700">{item.pricing?.wholesale ? formatCurrency(item.pricing.wholesale) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3 text-right text-gray-500">{item.gstRate}%</td>
                <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.lineTotal)}</td>
                {checkMode && (
                  <td className="px-3 py-3">
                    <div className="flex gap-1.5 justify-center">
                      <button onClick={() => toggleCheck(i, 'ok')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${checkState === 'ok' ? 'bg-green-500 text-white' : 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-100'}`}>✓</button>
                      <button onClick={() => toggleCheck(i, 'wrong')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${checkState === 'wrong' ? 'bg-red-500 text-white' : 'bg-red-50 text-red-500 border border-red-200 hover:bg-red-100'}`}>✗</button>
                    </div>
                    {checkState === 'wrong' && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-xs font-bold text-red-500 bg-red-100 rounded-full w-5 h-5 flex items-center justify-center shrink-0">{i + 1}</span>
                        <input
                          value={itemNotes[i] || ''}
                          onChange={e => setItemNotes(p => ({ ...p, [i]: e.target.value }))}
                          placeholder="Note…"
                          className="flex-1 border border-red-200 bg-red-50 rounded px-2 py-1 text-xs text-red-700 placeholder:text-red-300 focus:outline-none focus:ring-1 focus:ring-red-400 min-w-0"
                        />
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}</tbody>
        </table>
        </div>
        <div className="flex justify-end p-5 border-t">
          <div className="w-full sm:w-56 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Total Qty</span><span className="font-medium">{totalQty} pcs</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(inv.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">GST</span><span>{formatCurrency(inv.totalGST)}</span></div>
            {(inv.billDiscount || 0) > 0 && <div className="flex justify-between text-orange-600"><span>Bill Discount</span><span>− {formatCurrency(inv.billDiscount)}</span></div>}
            {(inv.otherCharges || 0) > 0 && <div className="flex justify-between text-blue-600"><span>{inv.otherChargesNarration || 'Other Charges'}</span><span>+ {formatCurrency(inv.otherCharges)}</span></div>}
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
        {/* Header row with select-all */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Set stickers to print for each item.</p>
          <button
            onClick={() => {
              const allSelected = labelQtys.every(i => i.selected);
              setLabelQtys(prev => prev.map(it => ({ ...it, selected: !allSelected })));
            }}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 underline"
          >
            {labelQtys.every(i => i.selected) ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {labelQtys.map((item, idx) => (
            <div key={idx} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${item.selected ? 'bg-white border-blue-200' : 'bg-gray-50 border-gray-100 opacity-50'}`}>
              {/* Serial number */}
              <span className="text-xs font-bold text-gray-400 w-5 text-center shrink-0">{idx + 1}</span>

              {/* Checkbox */}
              <input
                type="checkbox"
                checked={item.selected}
                onChange={e => setLabelQtys(prev => prev.map((it, i) => i === idx ? { ...it, selected: e.target.checked } : it))}
                className="w-4 h-4 rounded accent-blue-600 cursor-pointer shrink-0"
              />

              {/* Product info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{item.productName}</p>
                {item.sku && <p className="text-xs text-blue-500 font-mono mt-0.5">#{item.sku}</p>}
                <p className="text-xs text-gray-400 mt-0.5">Purchased: {item.quantity} {item.unit}</p>
              </div>

              {/* Qty controls */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  disabled={!item.selected}
                  onClick={() => setLabelQtys(prev => prev.map((it, i) => i === idx ? { ...it, labelQty: Math.max(0, it.labelQty - 1) } : it))}
                  className="w-7 h-7 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 text-base font-bold flex items-center justify-center select-none disabled:opacity-40"
                >−</button>
                <input
                  type="number" min="0"
                  disabled={!item.selected}
                  value={item.labelQty}
                  onChange={e => setLabelQtys(prev => prev.map((it, i) => i === idx ? { ...it, labelQty: Math.max(0, +e.target.value || 0) } : it))}
                  className="w-14 text-center border border-gray-300 rounded-lg px-1 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-40"
                />
                <button
                  disabled={!item.selected}
                  onClick={() => setLabelQtys(prev => prev.map((it, i) => i === idx ? { ...it, labelQty: it.labelQty + 1 } : it))}
                  className="w-7 h-7 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 text-base font-bold flex items-center justify-center select-none disabled:opacity-40"
                >+</button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center pt-2 border-t">
          <p className="text-sm text-gray-500">
            <strong>{labelQtys.filter(i => i.selected).length}</strong> item{labelQtys.filter(i => i.selected).length !== 1 ? 's' : ''} ·{' '}
            <strong>{labelQtys.filter(i => i.selected).reduce((s, i) => s + (i.labelQty || 0), 0)}</strong> labels
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
