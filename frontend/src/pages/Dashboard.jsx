import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInvoices } from '../context/InvoiceContext';
import { useProducts } from '../context/ProductContext';
import { useCustomers } from '../context/CustomerContext';
import { useSettings } from '../context/SettingsContext';
import { formatCurrency, formatDate, formatCustomerDisplay } from '../utils/helpers';

const payBadge = {
  paid:    'bg-green-100 text-green-700',
  partial: 'bg-yellow-100 text-yellow-700',
  unpaid:  'bg-red-100 text-red-700',
};

function StatCard({ label, value, sub, color }) {
  const colors = {
    green:  'bg-green-50  border-green-200  text-green-700',
    blue:   'bg-blue-50   border-blue-200   text-blue-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    red:    'bg-red-50    border-red-200    text-red-700',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { saleInvoices } = useInvoices();
  const { active: products } = useProducts();
  const { active: customers } = useCustomers();
  const { settings } = useSettings();

  const today = new Date().toISOString().slice(0, 10);

  const todayInvoices = useMemo(() =>
    [...saleInvoices]
      .filter(i => i.date === today && i.status !== 'void')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [saleInvoices, today]
  );

  const todaySales    = todayInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0);
  const pendingDues   = customers.reduce((s, c) => s + Math.max(c.balance || 0, 0), 0);
  const lowStockCount = products.filter(p => (p.currentStock || 0) <= (p.lowStockThreshold ?? settings.lowStockThreshold)).length;

  const topDues = useMemo(() =>
    [...customers]
      .filter(c => (c.balance || 0) > 0.01)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 12),
    [customers]
  );

  const waText = (inv) => {
    const bal = (inv.grandTotal || 0) - (inv.amountPaid || 0);
    return encodeURIComponent(
      `Dear ${inv.customerName || 'Customer'},\n\nInvoice No: ${inv.invoiceNumber}\nDate: ${formatDate(inv.date)}\nAmount: ${formatCurrency(inv.grandTotal)}` +
      (bal > 0.01 ? `\nBalance Due: ${formatCurrency(bal)}` : '\nStatus: Paid') +
      `\n\n${settings.company?.name || 'Kamal Jewellers'}`
    );
  };

  const waReminderText = (c) =>
    encodeURIComponent(
      `Dear ${c.name},\n\nThis is a reminder that you have an outstanding balance of ${formatCurrency(c.balance)} with us.\n\nPlease arrange payment at your earliest convenience.\n\n${settings.company?.name || 'Kamal Jewellers'}`
    );

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-900">Today's Overview</h1>
        <div className="flex gap-2">
          <Link to="/sales/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700">
            + New Invoice
          </Link>
          <Link to="/production/new"
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 hidden sm:inline-flex">
            + Production
          </Link>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Today's Sales"  value={formatCurrency(todaySales)}    color="green" sub={`${todayInvoices.length} invoice${todayInvoices.length !== 1 ? 's' : ''}`} />
        <StatCard label="Pending Dues"   value={formatCurrency(pendingDues)}   color="orange" sub={`${topDues.length} customer${topDues.length !== 1 ? 's' : ''}`} />
        <StatCard label="Low Stock"      value={lowStockCount}                 color={lowStockCount > 0 ? 'red' : 'green'} sub="items" />
      </div>

      {/* ── Mobile quick actions ── */}
      <div className="sm:hidden grid grid-cols-2 gap-3">
        {[
          { to: '/sales',     icon: '🧾', label: 'Invoices',  sub: 'View all sales' },
          { to: '/customers', icon: '👥', label: 'Customers', sub: 'Manage' },
          { to: '/inventory', icon: '🗃️', label: 'Inventory', sub: 'Stock levels' },
          { to: '/reminders', icon: '🔔', label: 'Reminders', sub: 'Payment dues' },
        ].map(({ to, icon, label, sub }) => (
          <Link key={to} to={to}
            className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 shadow-sm active:bg-gray-50">
            <span className="text-2xl">{icon}</span>
            <div><p className="font-semibold text-gray-800 text-sm">{label}</p><p className="text-xs text-gray-400">{sub}</p></div>
          </Link>
        ))}
      </div>

      {/* ── Two-column ops layout (desktop) ── */}
      <div className="hidden sm:grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Today's invoices */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Today's Invoices</h2>
            <Link to="/sales" className="text-blue-600 text-sm hover:underline">View all</Link>
          </div>
          {todayInvoices.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <p className="text-3xl mb-2">🧾</p>
              <p className="text-sm">No invoices today yet</p>
              <Link to="/sales/new" className="mt-3 inline-block bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">
                Create Invoice
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
              {todayInvoices.map(inv => {
                const bal = (inv.grandTotal || 0) - (inv.amountPaid || 0);
                const phone = (inv.customerPhone || '').replace(/\D/g, '');
                const waUrl = phone
                  ? `https://wa.me/91${phone}?text=${waText(inv)}`
                  : `https://wa.me/?text=${waText(inv)}`;
                return (
                  <div key={inv.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-blue-600">{inv.invoiceNumber}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${payBadge[inv.paymentStatus] || 'bg-gray-100 text-gray-600'}`}>
                          {inv.paymentStatus}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {formatCustomerDisplay(inv.customerName, inv.customerPlace, inv.customerType)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-900">{formatCurrency(inv.grandTotal)}</p>
                      {bal > 0.01 && <p className="text-xs text-red-600">Due {formatCurrency(bal)}</p>}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => navigate(`/sales/${inv.id}/print`)}
                        title="Print / Download"
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg text-sm">
                        🖨
                      </button>
                      <a href={waUrl} target="_blank" rel="noreferrer"
                        title="Send on WhatsApp"
                        className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg text-sm">
                        💬
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Outstanding dues */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Outstanding Dues</h2>
            <Link to="/customers" className="text-blue-600 text-sm hover:underline">View all</Link>
          </div>
          {topDues.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm">No outstanding dues</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
              {topDues.map(c => {
                const phone = (c.phone || '').replace(/\D/g, '');
                const waUrl = phone
                  ? `https://wa.me/91${phone}?text=${waReminderText(c)}`
                  : `https://wa.me/?text=${waReminderText(c)}`;
                return (
                  <div key={c.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400 truncate">{c.place || c.phone || ''}</p>
                    </div>
                    <p className="text-sm font-bold text-red-600 shrink-0">{formatCurrency(c.balance)}</p>
                    {phone && (
                      <a href={waUrl} target="_blank" rel="noreferrer"
                        title="Send reminder on WhatsApp"
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg text-sm opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        💬
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile: today's invoices ── */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold text-gray-800">Today's Invoices</p>
          <Link to="/sales" className="text-blue-600 text-sm">View all</Link>
        </div>
        {todayInvoices.length === 0 ? (
          <p className="text-center py-8 text-gray-400 text-sm">No invoices today</p>
        ) : (
          <div className="space-y-2">
            {todayInvoices.map(inv => (
              <Link key={inv.id} to={`/sales/${inv.id}`}
                className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-2 shadow-sm active:bg-gray-50 block">
                <div className="min-w-0">
                  <p className="font-bold text-blue-600 text-sm">{inv.invoiceNumber}</p>
                  <p className="text-xs text-gray-600 truncate">{inv.customerName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-gray-900 text-sm">{formatCurrency(inv.grandTotal)}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${payBadge[inv.paymentStatus] || 'bg-gray-100 text-gray-600'}`}>
                    {inv.paymentStatus}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
