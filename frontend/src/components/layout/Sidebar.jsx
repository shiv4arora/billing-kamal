import { NavLink, useNavigate } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { useReminderLog } from '../../context/ReminderContext';
import { useLeads } from '../../context/LeadContext';
import { today } from '../../utils/helpers';

export default function Sidebar({ isOpen, onClose }) {
  const { active } = useProducts();
  const { settings } = useSettings();
  const { currentUser, isAdmin, logout, can } = useAuth();
  const { pendingCount } = useReminderLog();
  const { leads } = useLeads();
  const todayStr = today();
  const crmDueCount = leads.filter(l => l.nextFollowUp && l.nextFollowUp <= todayStr && l.stage !== 'won').length;
  const navigate = useNavigate();

  const lowStockCount = active.filter(p => (p.currentStock || 0) <= (p.lowStockThreshold ?? settings.lowStockThreshold)).length;

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const navSections = [
    {
      section: 'Overview',
      items: [{ to: '/', label: 'Dashboard', icon: '📊' }],
    },
    {
      section: 'Transactions',
      items: [
        ...(can('sales_view')     ? [{ to: '/sales',     label: 'Sale Invoices',     icon: '🧾' }] : []),
        ...(can('purchases_view') ? [{ to: '/purchases', label: 'Purchase Invoices', icon: '📦' }] : []),
        { to: '/quotations', label: 'Quotations', icon: '📋' },
        { to: '/production', label: 'Production', icon: '⚙️' },
      ],
    },
    {
      section: 'CRM',
      items: [{ to: '/crm', label: 'Leads', icon: '🎯' }],
    },
    {
      section: 'Master',
      items: [
        ...(can('products_view')   ? [{ to: '/products',  label: 'Products',   icon: '🏷️' }] : []),
        ...(can('inventory_view')  ? [{ to: '/inventory', label: 'Inventory',  icon: '🗃️' }] : []),
        ...(can('customers_view')  ? [{ to: '/customers', label: 'Customers',  icon: '👥' }] : []),
        ...(can('suppliers_view')  ? [{ to: '/suppliers', label: 'Suppliers',  icon: '🏭' }] : []),
      ],
    },
    {
      section: 'Accounts',
      items: [
        ...(can('customers_view') ? [{ to: '/customers', label: 'Customer Ledgers', icon: '📒' }] : []),
        ...(can('suppliers_view') ? [{ to: '/suppliers', label: 'Supplier Ledgers', icon: '📗' }] : []),
        { to: '/reminders', label: 'Reminders', icon: '🔔' },
      ],
    },
    ...(can('reports')
      ? [{
          section: 'Reports',
          items: [
            { to: '/reports/sales',        label: 'Sales Report',      icon: '📈' },
            { to: '/reports/purchases',    label: 'Purchase Report',   icon: '📉' },
            { to: '/reports/inventory',    label: 'Inventory Report',  icon: '📋' },
            { to: '/reports/profit-loss',  label: 'Profit & Loss',     icon: '💰' },
            { to: '/reports/vendor-sales', label: 'Vendor-wise Sales', icon: '🏭' },
          ],
        }]
      : []),
    ...((can('settings') || can('users_manage'))
      ? [{
          section: 'Config',
          items: [
            ...(can('settings')      ? [{ to: '/settings', label: 'Settings',         icon: '⚙️' }] : []),
            ...(can('users_manage')  ? [{ to: '/users',    label: 'User Management',  icon: '👤' }] : []),
          ],
        }]
      : []),
  ].filter(s => s.items.length > 0);

  return (
    <aside
      className={`
        fixed top-0 left-0 h-screen w-60 bg-gray-900 text-gray-300 flex flex-col z-40
        transition-transform duration-200
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}
    >
      <div className="px-5 py-5 border-b border-gray-700 flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-white font-bold text-lg leading-tight truncate">{settings.company.name || 'BillingPro'}</h1>
          <p className="text-gray-400 text-xs mt-0.5">Billing Software</p>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="lg:hidden text-gray-400 hover:text-white p-1 ml-2"
          aria-label="Close menu"
        >
          ✕
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navSections.map(section => (
          <div key={section.section} className="mb-5">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-widest px-2 mb-2">{section.section}</p>
            {section.items.map(item => (
              <NavLink
                key={item.to + item.label}
                to={item.to}
                end={item.to === '/'}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors ${
                    isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-300'
                  }`
                }
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.to === '/inventory' && lowStockCount > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                    {lowStockCount}
                  </span>
                )}
                {item.to === '/reminders' && pendingCount > 0 && (
                  <span className="bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                    {pendingCount}
                  </span>
                )}
                {item.to === '/crm' && crmDueCount > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                    {crmDueCount}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-gray-700">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{currentUser?.name || currentUser?.username}</p>
            <span
              className={`inline-block text-xs px-1.5 py-0.5 rounded-full font-semibold mt-0.5 ${
                isAdmin ? 'bg-red-900 text-red-300' : 'bg-blue-900 text-blue-300'
              }`}
            >
              {isAdmin ? 'ADMIN' : 'USER'}
            </span>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="text-gray-400 hover:text-white text-xs px-2 py-1.5 rounded hover:bg-gray-700 transition-colors whitespace-nowrap"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
