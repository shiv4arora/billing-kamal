import { useState, Fragment } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useInvoices } from '../../context/InvoiceContext';
import { useSettings } from '../../context/SettingsContext';
import { useCustomers } from '../../context/CustomerContext';
import { api } from '../../hooks/useApi';
import { Button, Badge, Card, Modal, Input, Select, useToast, Toast } from '../../components/ui';
import { formatCurrency, formatDate, amountInWords, formatCustomerDisplay, today } from '../../utils/helpers';

const statusColor = { draft: 'gray', issued: 'blue', paid: 'green', completed: 'green', void: 'red' };
// 'void' is the internal status; shown to users as "Deleted"
const statusLabel = (s) => (s === 'void' ? 'deleted' : s);

export default function SaleInvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { getSaleInvoice, updateSaleInvoiceLocal } = useInvoices();
  const { settings } = useSettings();
  const { get: getCustomer, refreshOne: refreshCustomer } = useCustomers();
  const inv = getSaleInvoice(id);

  const [retOpen, setRetOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [retForm, setRetForm] = useState({ date: today(), amount: '', notes: '' });

  // Check Bill
  const [checkMode, setCheckMode] = useState(false);
  const [itemChecks, setItemChecks] = useState({});
  const [itemNotes, setItemNotes] = useState({});
  const [itemCorrections, setItemCorrections] = useState({});
  const [applying, setApplying] = useState(false);

  const toggleCheck = (idx, val) =>
    setItemChecks(p => ({ ...p, [idx]: p[idx] === val ? null : val }));

  const setCorrection = (idx, field, value) =>
    setItemCorrections(p => ({ ...p, [idx]: { ...p[idx], [field]: value } }));

  if (!inv) return <div className="p-8 text-center text-gray-400">Invoice not found.</div>;

  const pendingFixes = (inv.items || []).filter((item, i) =>
    itemChecks[i] === 'wrong' && (
      (itemCorrections[i]?.qty !== undefined && itemCorrections[i].qty !== item.quantity) ||
      (itemCorrections[i]?.rate !== undefined && itemCorrections[i].rate !== item.unitPrice) ||
      (itemCorrections[i]?.sku !== undefined && itemCorrections[i].sku !== (item.sku || ''))
    )
  ).length;

  const applyCorrections = async () => {
    setApplying(true);
    try {
      const correctedItems = (inv.items || []).map((item, i) => {
        if (itemChecks[i] !== 'wrong') return item;
        const newQty = itemCorrections[i]?.qty ?? item.quantity;
        const newRate = itemCorrections[i]?.rate ?? item.unitPrice;
        const newSku = itemCorrections[i]?.sku ?? item.sku;
        const gross = newQty * newRate;
        const disc = (gross * (item.discountPct || 0)) / 100;
        const taxable = gross - disc;
        const gstAmt = (taxable * (item.gstRate || 0)) / 100;
        return { ...item, quantity: newQty, unitPrice: newRate, sku: newSku, lineTotal: taxable + gstAmt, taxableAmount: taxable };
      });
      const updated = await api(`/sales/${id}`, { method: 'PUT', body: { ...inv, items: correctedItems } });
      updateSaleInvoiceLocal(id, updated);
      toast.success(`${pendingFixes} correction${pendingFixes !== 1 ? 's' : ''} applied`);
      setCheckMode(false);
      setItemChecks({}); setItemNotes({}); setItemCorrections({});
    } catch (e) { toast.error(e.message || 'Failed to apply corrections'); }
    finally { setApplying(false); }
  };

  const complete = async () => {
    if (!window.confirm(`Mark invoice ${inv.invoiceNumber} as complete?\n\nThis marks the billing as finalised and checked. It does NOT record any payment — record payments in the customer ledger.`)) return;
    try {
      const updated = await api(`/sales/${id}/complete`, { method: 'PATCH' });
      updateSaleInvoiceLocal(id, updated);
      toast.success('Invoice marked as complete');
    } catch (e) { toast.error(e.message); }
  };

  const voidInv = async () => {
    if (!confirm('Delete this invoice? This will remove it from the ledger and reverse stock.')) return;
    try {
      const updated = await api(`/sales/${id}/void`, { method: 'PATCH' });
      updateSaleInvoiceLocal(id, updated);
      if (inv.customerId) refreshCustomer(inv.customerId);
      toast.success('Invoice deleted · removed from ledger');
    } catch (e) { toast.error(e.message); }
  };

  const unvoidInv = async () => {
    if (!confirm('Restore this invoice? It will reappear in the ledger.')) return;
    try {
      const updated = await api(`/sales/${id}/unvoid`, { method: 'PATCH' });
      updateSaleInvoiceLocal(id, updated);
      if (inv.customerId) refreshCustomer(inv.customerId);
      toast.success('Invoice restored · ledger updated');
    } catch (e) { toast.error(e.message); }
  };

  const handleSaleReturn = async () => {
    if (!retForm.amount || +retForm.amount <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      await api(`/sales/${id}/return`, {
        method: 'POST',
        body: { date: retForm.date, amount: +retForm.amount, notes: retForm.notes },
      });
      if (inv.customerId) refreshCustomer(inv.customerId);
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
    return `*${settings.company.name || 'BillingPro'}*\n*Invoice: ${inv.invoiceNumber}*\nDate: ${formatDate(inv.date)}\nCustomer: ${displayName}\n\n*Items:*\n${itemLines}${moreItems}\n\n*Total: ${formatCurrency(inv.grandTotal)}*\n\nThank you for your business! 🙏`;
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
    <div className="max-w-4xl space-y-4">

      {/* ── MOBILE HEADER ────────────────────────────────────────── */}
      <div className="lg:hidden space-y-3">
        {/* Title + quick icons */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => navigate('/sales')} className="text-gray-400 p-1 -ml-1 shrink-0">←</button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-lg font-bold text-gray-900">{inv.invoiceNumber}</h1>
                <Badge color={statusColor[inv.status]}>{statusLabel(inv.status)}</Badge>
              </div>
              <p className="text-xs text-gray-400 truncate">
                {formatDate(inv.date)} · {formatCustomerDisplay(inv.customerName, inv.customerPlace, inv.customerType)}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => setWaOpen(true)} className="p-2 text-gray-600 bg-gray-100 rounded-lg text-base active:bg-gray-200">📱</button>
            <Link to={`/sales/${id}/print`}><button className="p-2 text-gray-600 bg-gray-100 rounded-lg text-base active:bg-gray-200">🖨</button></Link>
          </div>
        </div>

        {/* Total tile */}
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs text-gray-400 mb-0.5">Grand Total</p>
          <p className="font-bold text-gray-900 text-lg">{formatCurrency(inv.grandTotal)}</p>
        </div>

        {/* Primary action — Complete (billing checked, no payment) */}
        {inv.status !== 'completed' && inv.status !== 'void' && (
          <button onClick={complete}
            className="w-full py-3 bg-green-100 text-green-700 text-sm font-semibold rounded-xl active:bg-green-200">
            ✓ Mark Complete
          </button>
        )}

        {/* Secondary actions — horizontal scroll row */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
          <button
            onClick={() => { setCheckMode(v => !v); setItemChecks({}); }}
            className={`shrink-0 px-3 py-2 text-xs rounded-lg font-medium whitespace-nowrap ${checkMode ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 active:bg-blue-100'}`}>
            {checkMode ? '✕ End Check' : '🔍 Check Bill'}
          </button>
          <Link to={`/customers/${inv.customerId}/ledger`}>
            <button className="shrink-0 px-3 py-2 text-xs text-white bg-blue-600 rounded-lg font-medium active:bg-blue-700 whitespace-nowrap">📒 Ledger</button>
          </Link>
          {inv.status !== 'void' && (
            <Link to={`/sales/${id}/edit`}>
              <button className="shrink-0 px-3 py-2 text-xs text-gray-600 bg-gray-100 rounded-lg font-medium active:bg-gray-200">✏️ Edit</button>
            </Link>
          )}
          {inv.status !== 'void' && (
            <button onClick={voidInv} className="shrink-0 px-3 py-2 text-xs text-red-500 bg-red-50 rounded-lg font-medium active:bg-red-100">Delete</button>
          )}
          {inv.status === 'void' && (
            <button onClick={unvoidInv} className="shrink-0 px-3 py-2 text-xs text-green-700 bg-green-50 rounded-lg font-medium active:bg-green-100 whitespace-nowrap">↩ Restore</button>
          )}
        </div>
      </div>

      {/* ── DESKTOP HEADER ───────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/sales')} className="text-gray-400 hover:text-gray-600">←</button>
          <h1 className="text-xl font-bold text-gray-900">{inv.invoiceNumber}</h1>
          <Badge color={statusColor[inv.status]}>{statusLabel(inv.status)}</Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant={checkMode ? 'primary' : 'outline'} onClick={() => { setCheckMode(v => !v); setItemChecks({}); }}>
            {checkMode ? '✕ End Check' : '🔍 Check Bill'}
          </Button>
          <Link to={`/customers/${inv.customerId}/ledger`}><button className="inline-flex items-center gap-2 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500">📒 Ledger</button></Link>
          <Button variant="outline" onClick={() => setWaOpen(true)}>📱 WhatsApp</Button>
          <Link to={`/sales/${id}/print`}><Button variant="outline">🖨 Print</Button></Link>
          {inv.status !== 'void' && <Link to={`/sales/${id}/edit`}><Button variant="secondary">Edit</Button></Link>}
          {inv.status !== 'completed' && inv.status !== 'void' && <Button variant="success" onClick={complete}>✓ Mark Complete</Button>}
          {inv.status !== 'void' && <Button variant="danger" onClick={voidInv}>Delete</Button>}
          {inv.status === 'void' && <Button variant="success" onClick={unvoidInv}>↩ Restore Invoice</Button>}
        </div>
      </div>

      {/* ── MOBILE INFO CARD (compact single card) ───────────────── */}
      <div className="lg:hidden bg-white border border-gray-200 rounded-xl p-4 text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-400">Customer</span>
          <span className="font-semibold text-gray-900 text-right ml-4">
            {formatCustomerDisplay(inv.customerName, inv.customerPlace, inv.customerType)}
            {inv.customerType && (
              <span className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                inv.customerType === 'wholesale' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
              }`}>{inv.customerType === 'wholesale' ? 'H' : 'S'}</span>
            )}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Date</span>
          <span className="font-medium">{formatDate(inv.date)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Due</span>
          <span className="font-medium">{formatDate(inv.dueDate)}</span>
        </div>
        {inv.notes && <p className="text-xs text-gray-400 italic border-t pt-2">{inv.notes}</p>}
      </div>

      {/* ── DESKTOP INFO CARDS (3-col) ───────────────────────────── */}
      <div className="hidden lg:grid grid-cols-3 gap-4">
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
        <Card>
          <p className="text-xs text-gray-500 font-medium uppercase mb-2">Invoice</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Date</span><span className="font-medium">{formatDate(inv.date)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Due</span><span className="font-medium">{formatDate(inv.dueDate)}</span></div>
            {inv.notes && <p className="text-xs text-gray-400 pt-1 border-t italic">{inv.notes}</p>}
          </div>
        </Card>
        <Card>
          <p className="text-xs text-gray-500 font-medium uppercase mb-2">Total</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Grand Total</span><span className="font-semibold text-gray-900">{formatCurrency(inv.grandTotal)}</span></div>
            <Link to={`/customers/${inv.customerId}/ledger`} className="text-xs text-blue-600 hover:underline">View customer ledger for payments →</Link>
          </div>
        </Card>
      </div>

      {/* ── MOBILE ITEMS (compact rows) ──────────────────────────── */}
      <Card padding={false} className="lg:hidden">
        {/* Check progress bar */}
        {checkMode && (() => {
          const items = inv.items || [];
          const ok = items.filter((_, i) => itemChecks[i] === 'ok').length;
          const wrong = items.filter((_, i) => itemChecks[i] === 'wrong').length;
          const pending = items.length - ok - wrong;
          return (
            <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-100 gap-2">
              <span className="text-sm font-semibold text-blue-700 shrink-0">🔍 Checking…</span>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="text-green-600">{ok} ✓</span>
                <span className="text-red-500">{wrong} ✗</span>
                {pending > 0 && <span className="text-gray-400">{pending} left</span>}
              </div>
              {pendingFixes > 0 && (
                <button onClick={applyCorrections} disabled={applying}
                  className="shrink-0 ml-auto text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 active:bg-blue-700 whitespace-nowrap">
                  {applying ? 'Saving…' : `✓ Apply ${pendingFixes} fix${pendingFixes !== 1 ? 'es' : ''}`}
                </button>
              )}
            </div>
          );
        })()}
        <div className="divide-y divide-gray-100">
          {(inv.items || []).map((item, i) => {
            const checkState = itemChecks[i];
            return (
              <div key={i} className={`px-4 py-3 transition-colors ${checkState === 'ok' ? 'bg-green-50' : checkState === 'wrong' ? 'bg-red-50' : ''}`}>
                <div className="flex items-start gap-2.5">
                  {/* Serial number */}
                  <span className="text-xs font-bold text-gray-300 w-5 text-right shrink-0 mt-0.5">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-gray-900 text-sm leading-snug">{item.productName}</p>
                      <p className="font-semibold text-gray-900 text-sm shrink-0">{formatCurrency(item.lineTotal)}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {item.sku && <span className="text-xs font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">#{item.sku}</span>}
                      {item.hsnCode && <span className="text-xs text-gray-400">HSN:{item.hsnCode}</span>}
                      <span className="text-xs text-gray-400">{item.quantity} {item.unit} × {formatCurrency(item.unitPrice)}{item.discountPct ? ` − ${item.discountPct}%` : ''}{item.gstRate ? ` + ${item.gstRate}% GST` : ''}</span>
                    </div>
                  </div>
                </div>
                {/* Check buttons */}
                {checkMode && (
                  <>
                    <div className="flex gap-2 mt-2 pl-7">
                      <button
                        onClick={() => toggleCheck(i, 'ok')}
                        className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                          checkState === 'ok'
                            ? 'bg-green-500 text-white'
                            : 'bg-white border border-green-300 text-green-600 active:bg-green-50'
                        }`}>
                        ✓ Correct
                      </button>
                      <button
                        onClick={() => toggleCheck(i, 'wrong')}
                        className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                          checkState === 'wrong'
                            ? 'bg-red-500 text-white'
                            : 'bg-white border border-red-300 text-red-500 active:bg-red-50'
                        }`}>
                        ✗ Wrong
                      </button>
                    </div>
                    {checkState === 'wrong' && (
                      <div className="mt-2 space-y-2">
                        <input
                          value={itemNotes[i] || ''}
                          onChange={e => setItemNotes(p => ({ ...p, [i]: e.target.value }))}
                          placeholder="Note what's wrong…"
                          className="w-full border border-red-200 bg-red-50 rounded-lg px-3 py-2 text-xs text-red-700 placeholder:text-red-300 focus:outline-none focus:ring-1 focus:ring-red-400"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Qty <span className="text-gray-300">({item.quantity})</span></p>
                            <input type="number" min="0"
                              value={itemCorrections[i]?.qty ?? ''}
                              onChange={e => setCorrection(i, 'qty', e.target.value === '' ? undefined : +e.target.value)}
                              onWheel={e => e.target.blur()}
                              placeholder={String(item.quantity)}
                              className="w-full border border-red-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-red-400"
                            />
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Rate <span className="text-gray-300">({item.unitPrice})</span></p>
                            <input type="number" min="0"
                              value={itemCorrections[i]?.rate ?? ''}
                              onChange={e => setCorrection(i, 'rate', e.target.value === '' ? undefined : +e.target.value)}
                              onWheel={e => e.target.blur()}
                              placeholder={String(item.unitPrice)}
                              className="w-full border border-red-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-red-400"
                            />
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-1">SKU <span className="text-gray-300">({item.sku || '—'})</span></p>
                            <input type="text"
                              value={itemCorrections[i]?.sku ?? ''}
                              onChange={e => setCorrection(i, 'sku', e.target.value)}
                              placeholder={item.sku || '—'}
                              className="w-full border border-red-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-red-400"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="p-4 border-t space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(inv.subtotal)}</span></div>
          {inv.totalDiscount > 0 && <div className="flex justify-between text-red-600"><span>Discount</span><span>-{formatCurrency(inv.totalDiscount)}</span></div>}
          {inv.totalCGST > 0 && <div className="flex justify-between"><span className="text-gray-500">CGST</span><span>{formatCurrency(inv.totalCGST)}</span></div>}
          {inv.totalSGST > 0 && <div className="flex justify-between"><span className="text-gray-500">SGST</span><span>{formatCurrency(inv.totalSGST)}</span></div>}
          {inv.totalIGST > 0 && <div className="flex justify-between"><span className="text-gray-500">IGST</span><span>{formatCurrency(inv.totalIGST)}</span></div>}
          {((inv.packingCharges || 0) + (inv.shippingCharges || 0)) > 0 && <div className="flex justify-between"><span className="text-gray-500">Packing &amp; Shipping</span><span>{formatCurrency((inv.packingCharges || 0) + (inv.shippingCharges || 0))}</span></div>}
          <div className="flex justify-between font-bold text-base border-t pt-2"><span>Grand Total</span><span className="text-blue-700">{formatCurrency(inv.grandTotal)}</span></div>
          <p className="text-xs text-gray-400 italic pt-1">{amountInWords(inv.grandTotal)}</p>
        </div>
      </Card>

      {/* ── DESKTOP ITEMS (full table) ────────────────────────────── */}
      <Card padding={false} className="hidden lg:block">
        {/* Check progress bar */}
        {checkMode && (() => {
          const items = inv.items || [];
          const ok = items.filter((_, i) => itemChecks[i] === 'ok').length;
          const wrong = items.filter((_, i) => itemChecks[i] === 'wrong').length;
          const pending = items.length - ok - wrong;
          return (
            <div className="flex items-center justify-between px-5 py-2.5 bg-blue-50 border-b border-blue-100 gap-3">
              <span className="text-sm font-semibold text-blue-700">🔍 Checking bill…</span>
              <div className="flex items-center gap-4 text-sm font-semibold">
                <span className="text-green-600">{ok} ✓ correct</span>
                <span className="text-red-500">{wrong} ✗ wrong</span>
                {pending > 0 && <span className="text-gray-400">{pending} unchecked</span>}
              </div>
              {pendingFixes > 0 && (
                <button onClick={applyCorrections} disabled={applying}
                  className="ml-auto text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 hover:bg-blue-700 whitespace-nowrap">
                  {applying ? 'Saving…' : `✓ Apply ${pendingFixes} fix${pendingFixes !== 1 ? 'es' : ''}`}
                </button>
              )}
            </div>
          );
        })()}
        <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
            <th className="px-4 py-3 text-left">#</th>
            <th className="px-4 py-3 text-left">Product</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3 text-right">Rate</th>
            <th className="px-4 py-3 text-right">Disc</th>
            <th className="px-4 py-3 text-right">Taxable</th>
            <th className="px-4 py-3 text-right">GST</th>
            <th className="px-4 py-3 text-right">Total</th>
            {checkMode && <th className="px-4 py-3 text-center w-36">Check</th>}
          </tr></thead>
          <tbody>
            {(inv.items || []).map((item, i) => {
              const checkState = itemChecks[i];
              return (
                <Fragment key={i}>
                  <tr className={`transition-colors ${checkState === 'wrong' ? '' : 'border-b'} ${checkState === 'ok' ? 'bg-green-50' : checkState === 'wrong' ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
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
                    {checkMode && (
                      <td className="px-3 py-3">
                        <div className="flex gap-1.5 justify-center">
                          <button onClick={() => toggleCheck(i, 'ok')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                              checkState === 'ok' ? 'bg-green-500 text-white' : 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-100'
                            }`}>✓</button>
                          <button onClick={() => toggleCheck(i, 'wrong')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                              checkState === 'wrong' ? 'bg-red-500 text-white' : 'bg-red-50 text-red-500 border border-red-200 hover:bg-red-100'
                            }`}>✗</button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {checkMode && checkState === 'wrong' && (
                    <tr className="bg-red-50 border-b">
                      <td colSpan={9} className="px-4 pb-3 pt-1">
                        <div className="flex items-end gap-3 pl-6">
                          <div className="flex-1">
                            <p className="text-xs text-gray-400 mb-1">Note</p>
                            <input value={itemNotes[i] || ''}
                              onChange={e => setItemNotes(p => ({ ...p, [i]: e.target.value }))}
                              placeholder="What's wrong…"
                              className="w-full border border-red-200 bg-white rounded-lg px-3 py-1.5 text-xs text-red-700 placeholder:text-red-300 focus:outline-none focus:ring-1 focus:ring-red-400" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Qty <span className="text-gray-300">({item.quantity})</span></p>
                            <input type="number" min="0"
                              value={itemCorrections[i]?.qty ?? ''}
                              onChange={e => setCorrection(i, 'qty', e.target.value === '' ? undefined : +e.target.value)}
                              onWheel={e => e.target.blur()}
                              placeholder={String(item.quantity)}
                              className="w-20 border border-red-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-red-400" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-1">Rate <span className="text-gray-300">({item.unitPrice})</span></p>
                            <input type="number" min="0"
                              value={itemCorrections[i]?.rate ?? ''}
                              onChange={e => setCorrection(i, 'rate', e.target.value === '' ? undefined : +e.target.value)}
                              onWheel={e => e.target.blur()}
                              placeholder={String(item.unitPrice)}
                              className="w-24 border border-red-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-red-400" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-1">SKU <span className="text-gray-300">({item.sku || '—'})</span></p>
                            <input type="text"
                              value={itemCorrections[i]?.sku ?? ''}
                              onChange={e => setCorrection(i, 'sku', e.target.value)}
                              placeholder={item.sku || '—'}
                              className="w-28 border border-red-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-400" />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
        <div className="flex justify-end p-4 sm:p-5 border-t">
          <div className="w-full sm:w-72 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(inv.subtotal)}</span></div>
            {inv.totalDiscount > 0 && <div className="flex justify-between text-red-600"><span>Discount</span><span>-{formatCurrency(inv.totalDiscount)}</span></div>}
            {inv.totalCGST > 0 && <div className="flex justify-between"><span className="text-gray-500">CGST</span><span>{formatCurrency(inv.totalCGST)}</span></div>}
            {inv.totalSGST > 0 && <div className="flex justify-between"><span className="text-gray-500">SGST</span><span>{formatCurrency(inv.totalSGST)}</span></div>}
            {inv.totalIGST > 0 && <div className="flex justify-between"><span className="text-gray-500">IGST</span><span>{formatCurrency(inv.totalIGST)}</span></div>}
            {((inv.packingCharges || 0) + (inv.shippingCharges || 0)) > 0 && <div className="flex justify-between"><span className="text-gray-500">Packing &amp; Shipping</span><span>{formatCurrency((inv.packingCharges || 0) + (inv.shippingCharges || 0))}</span></div>}
            <div className="flex justify-between font-bold text-base border-t pt-2"><span>Grand Total</span><span className="text-blue-700">{formatCurrency(inv.grandTotal)}</span></div>
          </div>
        </div>
        <div className="px-5 pb-4 text-xs text-gray-500 italic">{amountInWords(inv.grandTotal)}</div>
      </Card>
    </div>


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
