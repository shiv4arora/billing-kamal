import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useReminderLog } from '../../context/ReminderContext';

export default function BottomNav({ onMenuOpen }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { pendingCount } = useReminderLog();

  const tab = (to, icon, label, end = false) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[10px] font-medium transition-colors ${
          isActive ? 'text-blue-500' : 'text-gray-400'
        }`
      }
    >
      <span className="text-xl leading-none">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 safe-bottom flex items-stretch"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {tab('/', '📊', 'Home', true)}
      {tab('/sales', '🧾', 'Sales')}

      {/* Centre FAB — New Invoice */}
      <button
        onClick={() => navigate('/sales/new')}
        className="flex flex-col items-center justify-center flex-1 py-1 gap-0.5"
        aria-label="New Invoice"
      >
        <span className="w-11 h-11 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl shadow-md -mt-4">
          ＋
        </span>
        <span className="text-[10px] font-medium text-blue-600 mt-0.5">New</span>
      </button>

      {tab('/purchases', '📦', 'Purchases')}

      {/* Menu button */}
      <button
        onClick={onMenuOpen}
        className="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[10px] font-medium text-gray-400 relative"
      >
        <span className="text-xl leading-none">☰</span>
        <span>More</span>
        {pendingCount > 0 && (
          <span className="absolute top-1.5 right-[calc(50%-14px)] bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </button>
    </nav>
  );
}
