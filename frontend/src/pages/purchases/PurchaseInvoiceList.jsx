import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInvoices } from '../../context/InvoiceContext';
import { useSuppliers } from '../../context/SupplierContext';
import { Button, Table, Badge, SearchInput, Card } from '../../components/ui';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { api } from '../../hooks/useApi';

const payColor   = { paid: 'green', partial: 'yellow', unpaid: 'red' };
const statusColor = { draft: 'gray', issued: 'blue', paid: 'green', void: 'red' };

const payBg = {
  paid:    'bg-green-100 text-green-700',
  partial: 'bg-yellow-100 text-yellow-700',
  unpaid:  'bg-red-100 text-red-700',
};

const BLANK_TASK = { supplierName: '', description: '', isUrgent: false, expectedDate: '', expectedTime: '', notes: '' };

// ── Shared parcel form fields ────────────────────────────────────────────────
function ParcelForm({ f, setF, suppliers, idPrefix = '' }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Supplier name *</label>
          <input
            list={`${idPrefix}supplier-list`}
            value={f.supplierName}
            onChange={e => setF(v => ({ ...v, supplierName: e.target.value }))}
            placeholder="Supplier…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <datalist id={`${idPrefix}supplier-list`}>
            {suppliers.map(s => <option key={s.id} value={s.name} />)}
          </datalist>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Expected date</label>
            <input type="date" value={f.expectedDate}
              onChange={e => setF(v => ({ ...v, expectedDate: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Time</label>
            <input type="time" value={f.expectedTime}
              onChange={e => setF(v => ({ ...v, expectedTime: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">What's coming</label>
        <input value={f.description}
          onChange={e => setF(v => ({ ...v, description: e.target.value }))}
          placeholder="e.g. Rakhi SP series, 5 boxes"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Notes (optional)</label>
        <input value={f.notes}
          onChange={e => setF(v => ({ ...v, notes: e.target.value }))}
          placeholder="Any extra info…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={f.isUrgent}
          onChange={e => setF(v => ({ ...v, isUrgent: e.target.checked }))}
          className="w-4 h-4 accent-red-600"
        />
        <span className="text-sm font-medium text-red-600">🔥 Mark as urgent</span>
      </label>
    </>
  );
}

// ── Incoming Parcels tab ─────────────────────────────────────────────────────
function IncomingParcels({ suppliers }) {
  const [tasks, setTasks]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [form, setForm]               = useState(BLANK_TASK);
  const [saving, setSaving]           = useState(false);
  const [editTaskId, setEditTaskId]   = useState(null);
  const [editForm, setEditForm]       = useState(BLANK_TASK);
  const [editSaving, setEditSaving]   = useState(false);
  const [nrId, setNrId]               = useState(null);   // "not received" active task id
  const [nrText, setNrText]           = useState('');

  useEffect(() => {
    api('/purchase-tasks')
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  const pending  = tasks.filter(t => t.status === 'pending');
  const received = tasks.filter(t => t.status === 'received');
  const urgent   = pending.filter(t => t.isUrgent);
  const normal   = pending.filter(t => !t.isUrgent);

  const save = async () => {
    if (!form.supplierName.trim()) return;
    setSaving(true);
    try {
      const created = await api('/purchase-tasks', { method: 'POST', body: form });
      setTasks(prev => [created, ...prev]);
      setForm(BLANK_TASK);
      setShowForm(false);
    } finally { setSaving(false); }
  };

  const startEdit = (task) => {
    setEditTaskId(task.id);
    setEditForm({
      supplierName: task.supplierName || '',
      description:  task.description  || '',
      isUrgent:     task.isUrgent     || false,
      expectedDate: task.expectedDate || '',
      expectedTime: task.expectedTime || '',
      notes:        task.notes        || '',
    });
    setNrId(null);
  };

  const saveEdit = async () => {
    if (!editForm.supplierName.trim()) return;
    setEditSaving(true);
    try {
      const updated = await api(`/purchase-tasks/${editTaskId}`, { method: 'PATCH', body: editForm });
      setTasks(prev => prev.map(t => t.id === editTaskId ? updated : t));
      setEditTaskId(null);
    } finally { setEditSaving(false); }
  };

  const markReceived = async (id) => {
    const updated = await api(`/purchase-tasks/${id}`, { method: 'PATCH', body: { status: 'received' } });
    setTasks(prev => prev.map(t => t.id === id ? updated : t));
  };

  const toggleUrgent = async (task) => {
    const updated = await api(`/purchase-tasks/${task.id}`, { method: 'PATCH', body: { isUrgent: !task.isUrgent } });
    setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
  };

  const saveNotReceived = async (id) => {
    if (!nrText.trim()) return;
    const updated = await api(`/purchase-tasks/${id}`, { method: 'PATCH', body: { notReceivedReason: nrText.trim() } });
    setTasks(prev => prev.map(t => t.id === id ? updated : t));
    setNrId(null); setNrText('');
  };

  const remove = async (id) => {
    await api(`/purchase-tasks/${id}`, { method: 'DELETE' });
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const TaskCard = ({ task, num }) => {
    const expectedStr = [
      task.expectedDate ? formatDate(task.expectedDate) : '',
      task.expectedTime || '',
    ].filter(Boolean).join(' at ');

    // Inline edit mode
    if (editTaskId === task.id) {
      return (
        <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="font-semibold text-gray-800 text-sm">Edit Parcel</p>
          <ParcelForm f={editForm} setF={setEditForm} suppliers={suppliers} idPrefix="edit-" />
          <div className="flex gap-2 pt-1">
            <button onClick={saveEdit} disabled={editSaving || !editForm.supplierName.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {editSaving ? 'Saving…' : 'Save Changes'}
            </button>
            <button onClick={() => setEditTaskId(null)}
              className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={`rounded-xl border px-4 py-2.5 ${task.isUrgent ? 'border-red-200 bg-red-50' : 'border-orange-200 bg-orange-50'}`}>
        {/* Top row: number + name + badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {num != null && (
            <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${task.isUrgent ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'}`}>{num}</span>
          )}
          <span className="font-semibold text-gray-900">{task.supplierName}</span>
          {task.isUrgent && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-600 text-white">🔥 Urgent</span>}
        </div>

        {/* Date/time — slightly larger */}
        {expectedStr && <p className="text-sm font-medium text-gray-500 mt-0.5">📅 {expectedStr}</p>}

        {/* Description + notes */}
        {task.description && <p className="text-sm text-gray-700 mt-0.5">{task.description}</p>}
        {task.notes && <p className="text-xs text-gray-400 italic">{task.notes}</p>}
        {task.notReceivedReason && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1 mt-1">
            ⚠ Not received: {task.notReceivedReason}
          </p>
        )}

        {/* Buttons — all in one horizontal row */}
        <div className="flex items-center gap-1.5 flex-wrap mt-2 pt-2 border-t border-black/5">
          {task.status === 'pending' && (
            <>
              <button onClick={() => markReceived(task.id)}
                className="text-xs px-2.5 py-1 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 whitespace-nowrap">
                ✓ Received
              </button>
              <button onClick={() => toggleUrgent(task)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium whitespace-nowrap ${task.isUrgent ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                {task.isUrgent ? 'Not urgent' : '🔥 Urgent'}
              </button>
              <button onClick={() => { setNrId(id => id === task.id ? null : task.id); setNrText(''); }}
                className="text-xs px-2.5 py-1 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 whitespace-nowrap">
                ⚠ Not received
              </button>
            </>
          )}
          <button onClick={() => startEdit(task)}
            className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg font-medium hover:bg-blue-100 whitespace-nowrap">
            ✏ Edit
          </button>
          <button onClick={() => remove(task.id)}
            className="text-xs px-2.5 py-1 bg-red-50 text-red-400 rounded-lg hover:bg-red-100 whitespace-nowrap">
            Delete
          </button>
        </div>

        {/* Not received reason input */}
        {nrId === task.id && (
          <div className="flex gap-2 pt-2 mt-1 border-t border-red-100">
            <input
              autoFocus
              value={nrText}
              onChange={e => setNrText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveNotReceived(task.id)}
              placeholder="Reason (e.g. delayed by supplier, wrong items)"
              className="flex-1 border border-red-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-400"
            />
            <button onClick={() => saveNotReceived(task.id)}
              className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 whitespace-nowrap">
              Save
            </button>
            <button onClick={() => { setNrId(null); setNrText(''); }}
              className="text-xs px-2 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
              ✕
            </button>
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div className="text-center py-16 text-gray-400">Loading…</div>;

  return (
    <div className="space-y-4">
      {/* Add task */}
      {showForm ? (
        <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="font-semibold text-gray-800 text-sm">New Incoming Parcel</p>
          <ParcelForm f={form} setF={setForm} suppliers={suppliers} />
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={saving || !form.supplierName.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Add Parcel'}
            </button>
            <button onClick={() => { setShowForm(false); setForm(BLANK_TASK); }}
              className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="w-full py-3 border-2 border-dashed border-blue-200 text-blue-600 rounded-xl text-sm font-medium hover:bg-blue-50 active:bg-blue-100">
          + Add Incoming Parcel
        </button>
      )}

      {/* Urgent */}
      {urgent.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-red-600 uppercase tracking-wide">🔥 Urgent — {urgent.length}</p>
          {urgent.map((t, i) => <TaskCard key={t.id} task={t} num={i + 1} />)}
        </div>
      )}

      {/* Normal pending */}
      {normal.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-orange-500 uppercase tracking-wide">Pending — {normal.length}</p>
          {normal.map((t, i) => <TaskCard key={t.id} task={t} num={urgent.length + i + 1} />)}
        </div>
      )}

      {urgent.length === 0 && normal.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📦</p>
          <p className="font-medium">No incoming parcels</p>
          <p className="text-sm mt-1">Add one above to track what's on its way</p>
        </div>
      )}

      {/* Received */}
      {received.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-bold text-gray-400 uppercase tracking-wide select-none list-none flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
            Received — {received.length}
          </summary>
          <div className="mt-2 space-y-2">
            {received.map(t => (
              <div key={t.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-center justify-between gap-3 opacity-60">
                <div className="min-w-0">
                  <span className="font-medium text-gray-600 text-sm">{t.supplierName}</span>
                  {t.description && <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>}
                </div>
                <button onClick={() => remove(t.id)} className="text-xs text-red-400 hover:text-red-600 shrink-0">Delete</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PurchaseInvoiceList() {
  const { purchaseInvoices, invoicesLoading } = useInvoices();
  const { suppliers } = useSuppliers();
  const navigate = useNavigate();
  const [search, setSearch]   = useState('');
  const [tab, setTab]         = useState('parcels'); // 'invoices' | 'parcels'

  const supplierLabel = (inv) => {
    const s = suppliers?.find(x => x.id === inv.supplierId);
    const name = s?.name || inv.supplierName;
    const code = s ? (s.code || s.name?.replace(/\s+/g,'').slice(0,4).toUpperCase()) : null;
    return code ? `${name} (${code})` : name;
  };

  const filtered = [...purchaseInvoices]
    .filter(i =>
      i.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
      i.supplierName?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const columns = [
    { header: 'Invoice #',  render: i => <span className="font-medium text-green-700">{i.invoiceNumber}</span> },
    { header: 'Supplier',   render: i => <div><p className="font-medium">{supplierLabel(i)}</p>{i.supplierInvoiceNumber && <p className="text-xs text-gray-400">Ref: {i.supplierInvoiceNumber}</p>}</div> },
    { header: 'Date',       render: i => formatDate(i.date) },
    { header: 'Amount',     align: 'right', render: i => formatCurrency(i.grandTotal) },
    { header: 'Status',     render: i => <Badge color={statusColor[i.status]}>{i.status}</Badge> },
    { header: 'Payment',    render: i => <Badge color={payColor[i.paymentStatus]}>{i.paymentStatus}</Badge> },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">Purchases</h1>
        <div className="flex gap-2">
          <Link to="/purchases/returns" className="hidden sm:block"><Button variant="outline">↩ Returns</Button></Link>
          <Link to="/purchases/new"><Button variant="success">+ New</Button></Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button onClick={() => setTab('invoices')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'invoices' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          Invoices
        </button>
        <button onClick={() => setTab('parcels')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'parcels' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          📦 Incoming Parcels
        </button>
      </div>

      {tab === 'invoices' && (
        <>
          <SearchInput value={search} onChange={setSearch} placeholder="Search purchases…" />

          {/* Mobile */}
          <div className="lg:hidden space-y-2">
            {invoicesLoading ? (
              <div className="text-center py-12 text-gray-400">
                <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-3xl mb-2">📦</p>
                <p className="font-medium">No purchase invoices yet</p>
              </div>
            ) : filtered.map(i => {
              const balance = (i.grandTotal || 0) - (i.amountPaid || 0);
              return (
                <div key={i.id} onClick={() => navigate(`/purchases/${i.id}`)}
                  className="bg-white rounded-xl border border-gray-200 px-4 py-3 active:bg-gray-50 cursor-pointer shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-green-700 text-sm">{i.invoiceNumber}</span>
                        {i.status === 'void' && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">Void</span>}
                        {i.supplierInvoiceNumber && <span className="text-xs text-gray-400">Ref: {i.supplierInvoiceNumber}</span>}
                      </div>
                      <p className="font-semibold text-gray-900 truncate">{supplierLabel(i) || '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-900">{formatCurrency(i.grandTotal)}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${payBg[i.paymentStatus] || 'bg-gray-100 text-gray-500'}`}>
                        {i.paymentStatus}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-400">{formatDate(i.date)}</span>
                    {balance > 0.01 && i.status !== 'void' && (
                      <span className="text-xs font-medium text-red-600">Due: {formatCurrency(balance)}</span>
                    )}
                    {balance <= 0.01 && i.paymentStatus === 'paid' && (
                      <span className="text-xs font-medium text-green-600">✓ Paid</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <Card padding={false} className="hidden lg:block">
            {invoicesLoading ? (
              <div className="text-center py-12 text-gray-400">
                <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Loading…
              </div>
            ) : (
              <Table columns={columns} data={filtered} onRowClick={i => navigate(`/purchases/${i.id}`)} emptyMsg="No purchase invoices yet." />
            )}
          </Card>
        </>
      )}

      {tab === 'parcels' && <IncomingParcels suppliers={suppliers || []} />}
    </div>
  );
}
