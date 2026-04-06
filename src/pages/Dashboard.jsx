import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useInvoices } from '../context/InvoiceContext';
import { useProducts } from '../context/ProductContext';
import { useCustomers } from '../context/CustomerContext';
import { useSettings } from '../context/SettingsContext';
import { StatCard, Card, Badge } from '../components/ui';
import { formatCurrency, formatDate, formatCustomerDisplay } from '../utils/helpers';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function Dashboard() {
  const { saleInvoices, purchaseInvoices } = useInvoices();
  const { active: products } = useProducts();
  const { active: customers } = useCustomers();
  const { settings } = useSettings();

  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const todayRevenue = saleInvoices.filter(i => i.date === todayStr && i.status !== 'void').reduce((s, i) => s + (i.grandTotal || 0), 0);
    const monthRevenue = saleInvoices.filter(i => i.date >= monthStart && i.status !== 'void').reduce((s, i) => s + (i.grandTotal || 0), 0);
    const outstanding = customers.reduce((s, c) => s + Math.max(c.balance || 0, 0), 0);
    const lowStock = products.filter(p => (p.currentStock || 0) <= (p.lowStockThreshold ?? settings.lowStockThreshold)).length;

    // Last 7 days revenue
    const dailyData = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      const ds = d.toISOString().slice(0, 10);
      const rev = saleInvoices.filter(inv => inv.date === ds && inv.status !== 'void').reduce((s, inv) => s + (inv.grandTotal || 0), 0);
      return { date: ds.slice(5), revenue: rev };
    });

    // Last 6 months
    const monthlyData = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() - (5 - i));
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const sales = saleInvoices.filter(inv => inv.date?.startsWith(ym) && inv.status !== 'void').reduce((s, inv) => s + (inv.grandTotal || 0), 0);
      const purchases = purchaseInvoices.filter(inv => inv.date?.startsWith(ym) && inv.status !== 'void').reduce((s, inv) => s + (inv.grandTotal || 0), 0);
      return { month: ym.slice(5), sales, purchases };
    });

    // Customer type breakdown
    const typeData = ['wholesale', 'shop', 'retail'].map(type => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      value: saleInvoices.filter(i => i.customerType === type && i.status !== 'void').reduce((s, i) => s + (i.grandTotal || 0), 0),
    })).filter(d => d.value > 0);

    // Top products
    const productMap = {};
    saleInvoices.filter(i => i.status !== 'void').forEach(inv => {
      (inv.items || []).forEach(item => {
        if (!productMap[item.productName]) productMap[item.productName] = { qty: 0, revenue: 0 };
        productMap[item.productName].qty += item.quantity || 0;
        productMap[item.productName].revenue += item.lineTotal || 0;
      });
    });
    const topProducts = Object.entries(productMap).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5).map(([name, v]) => ({ name, ...v }));

    // Recent sales
    const recentSales = [...saleInvoices].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

    return { todayRevenue, monthRevenue, outstanding, lowStock, dailyData, monthlyData, typeData, topProducts, recentSales };
  }, [saleInvoices, purchaseInvoices, products, customers, settings]);

  const statusColor = { draft: 'gray', issued: 'blue', paid: 'green', void: 'red' };
  const payColor = { paid: 'green', partial: 'yellow', unpaid: 'red' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex gap-3">
          <Link to="/sales/new" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">+ Sale Invoice</Link>
          <Link to="/purchases/new" className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">+ Purchase</Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Today's Revenue" value={formatCurrency(stats.todayRevenue)} icon="💵" color="green" />
        <StatCard title="Month Revenue" value={formatCurrency(stats.monthRevenue)} icon="📈" color="blue" />
        <StatCard title="Outstanding" value={formatCurrency(stats.outstanding)} icon="⏳" color="orange" />
        <StatCard title="Low Stock Items" value={stats.lowStock} icon="⚠️" color="red" sub="items below threshold" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2" padding={false}>
          <div className="px-5 pt-5 pb-2">
            <h3 className="font-semibold text-gray-800">Daily Revenue (Last 7 Days)</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.dailyData} margin={{ left: 10, right: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card padding={false}>
          <div className="px-5 pt-5 pb-2">
            <h3 className="font-semibold text-gray-800">Revenue by Customer Type</h3>
          </div>
          {stats.typeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={stats.typeData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {stats.typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">No sales data</div>}
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card padding={false}>
          <div className="px-5 pt-5 pb-2">
            <h3 className="font-semibold text-gray-800">Sales vs Purchases (6 Months)</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.monthlyData} margin={{ left: 10, right: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Legend />
              <Bar dataKey="sales" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Sales" />
              <Bar dataKey="purchases" fill="#10b981" radius={[3, 3, 0, 0]} name="Purchases" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card padding={false}>
          <div className="px-5 pt-5 pb-2">
            <h3 className="font-semibold text-gray-800">Top Products by Revenue</h3>
          </div>
          {stats.topProducts.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart layout="vertical" data={stats.topProducts} margin={{ left: 80, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={75} />
                <Tooltip formatter={v => formatCurrency(v)} />
                <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">No sales data</div>}
        </Card>
      </div>

      {/* Recent Sales & Low Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card padding={false}>
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Recent Sales</h3>
            <Link to="/sales" className="text-blue-600 text-sm hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {stats.recentSales.length === 0 ? (
              <p className="text-center py-8 text-gray-400 text-sm">No invoices yet</p>
            ) : stats.recentSales.map(inv => (
              <div key={inv.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-800">{inv.invoiceNumber}</p>
                  <p className="text-xs text-gray-500">{formatCustomerDisplay(inv.customerName, inv.customerPlace, inv.customerType)} · {formatDate(inv.date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{formatCurrency(inv.grandTotal)}</p>
                  <Badge color={payColor[inv.paymentStatus] || 'gray'}>{inv.paymentStatus}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card padding={false}>
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Low Stock Alert</h3>
            <Link to="/inventory" className="text-blue-600 text-sm hover:underline">Manage</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {products.filter(p => (p.currentStock || 0) <= (p.lowStockThreshold ?? settings.lowStockThreshold)).length === 0 ? (
              <p className="text-center py-8 text-gray-400 text-sm">All items well-stocked</p>
            ) : products.filter(p => (p.currentStock || 0) <= (p.lowStockThreshold ?? settings.lowStockThreshold)).slice(0, 5).map(p => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.category}</p>
                </div>
                <Badge color={p.currentStock <= 0 ? 'red' : 'orange'}>{p.currentStock || 0} {p.unit}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
