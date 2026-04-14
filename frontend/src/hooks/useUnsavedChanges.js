import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Blocks in-app navigation and browser tab close when isDirty is true.
 * Returns the blocker object — render <UnsavedChangesModal blocker={blocker} /> in your JSX.
 */
export function useUnsavedChanges(isDirty) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  // Browser tab close / reload
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  return blocker;
}

/** Drop this anywhere in JSX — shows a centered modal when navigation is blocked. */
export function UnsavedChangesModal({ blocker }) {
  if (blocker.state !== 'blocked') return null;
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Unsaved changes</h3>
            <p className="text-sm text-gray-500 mt-1">You have unsaved changes. If you leave now, they will be lost.</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end pt-1">
          <button
            onClick={() => blocker.reset()}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Stay
          </button>
          <button
            onClick={() => blocker.proceed()}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            Leave anyway
          </button>
        </div>
      </div>
    </div>
  );
}
