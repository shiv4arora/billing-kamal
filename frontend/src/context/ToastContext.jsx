import { createContext, useContext, useState, useCallback } from 'react';

const Ctx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const add = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  const remove = useCallback((id) => setToasts(p => p.filter(t => t.id !== id)), []);

  const toast = {
    success: (m) => add(m, 'success'),
    error:   (m) => add(m, 'error'),
    warning: (m) => add(m, 'warning'),
    toasts,
    remove,
  };

  return (
    <Ctx.Provider value={toast}>
      {children}
      {/* Global toast renderer — always on top */}
      <div className="fixed top-5 right-5 z-[999] flex flex-col gap-2 pointer-events-none" style={{ minWidth: '260px', maxWidth: '380px' }}>
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl text-white text-sm font-medium pointer-events-auto transition-all duration-300
              ${t.type === 'error'   ? 'bg-red-600' :
                t.type === 'warning' ? 'bg-amber-500' :
                                       'bg-emerald-600'}`}
            style={{ animation: 'slideInRight 0.25s ease-out' }}
          >
            <span className="text-base leading-none mt-0.5 flex-shrink-0">
              {t.type === 'error' ? '✕' : t.type === 'warning' ? '⚠' : '✓'}
            </span>
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              className="text-white/70 hover:text-white leading-none flex-shrink-0 text-base"
            >×</button>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(40px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </Ctx.Provider>
  );
}

export const useGlobalToast = () => useContext(Ctx);
