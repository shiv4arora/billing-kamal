import { NavLink, useNavigate } from 'react-router-dom';
import { useProducts } from '../../context/ProductContext';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar() {
  const { active } = useProducts();
  const { settings } = useSettings();
  const { currentUser, isAdmin, logout } = useAuth();
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
        { to: '/sales', label: 'Sale Invoices', icon: '🧾' },
        { to: '/purchases', label: 'Purchase Invoices', icon: '📦' },
      ],
    },
    {
      section: 'Master',
      items: [
        { to: '/products', label: 'Products', icon: '🏷️' },
        { to: '/inventory', label: 'Inventory', icon: '🗃️' },
        { to: '/customers', label: 'Customers', icon: '👥' },
        { to: '/suppliers', label: 'Suppliers', icon: '🏭' },
      ],
    },
    {
      section: 'Accounts',
      items: [
        { to: '/customers', label: 'Customer Ledgers', icon: '📒' },
        { to: '/suppliers', label: 'Supplier Ledgers', icon: '📗' },
      ],
    },
    ...(isAdmin
      ? [
          {
            section: 'Reports',
            items: [
              { to: '/reports/sales', label: 'Sales Report', icon: '📈' },
              { to: '/reports/purchases', label: 'Purchase Report', icon: '📉' },
              { to: '/reports/inventory', label: 'Inventory Report', icon: '📋' },
              { to: '/reports/profit-loss', label: 'Profit & Loss', icon: '💰' },
              { to: '/reports/vendor-sales', label: 'Vendor-wise Sales', icon: '🏭' },
            ],
          },
          {
            section: 'Config',
            items: [
              { to: '/settings', label: 'Settings', icon: '⚙️' },
              { to: '/users', label: 'User Management', icon: '👤' },
            ],
          },
        ]
      : []),
  ];

  return (
    <aside className="fixed top-0 left-0 h-screen w-60 bg-gray-900 text-gray-300 flex flex-col z-40">
      <div className="px-5 py-5 border-b border-gray-700">
        <h1 className="text-white font-bold text-lg leading-tight truncate">{settings.company.name || 'BillingPro'}</h1>
        <p className="text-gray-400 text-xs mt-0.5">Billing Software</p>
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
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Logged-in user + logout */}
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
