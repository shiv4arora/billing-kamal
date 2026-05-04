import { useEffect, useCallback } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Blocks ALL navigation (sidebar, back button, links) when dirty.
 * Also blocks browser tab close / refresh.
 * Returns { confirmLeave, SavePrompt } — render <SavePrompt /> anywhere in the page.
 */
export function useUnsavedChanges(isDirty) {
  // Block in-app navigation (React Router)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  // Block browser refresh / tab close
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Legacy: manual confirmLeave for explicit navigate() calls
  const confirmLeave = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm('You have unsaved changes. Leave without saving?');
  }, [isDirty]);

  // Modal shown when blocker intercepts navigation
  const SavePrompt = () => {
    if (blocker.state !== 'blocked') return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-xl p-6 w-80 space-y-4">
          <div className="text-center">
            <div className="text-3xl mb-2">⚠️</div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Unsaved Invoice</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              You have unsaved changes. Save as draft before leaving?
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => blocker.reset()}
              className="w-full py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              Stay &amp; Save
            </button>
            <button
              onClick={() => blocker.proceed()}
              className="w-full py-2 rounded-xl bg-gray-100 dark:bg-[#3A3A3C] text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-200"
            >
              Leave Without Saving
            </button>
          </div>
        </div>
      </div>
    );
  };

  return { confirmLeave, SavePrompt };
}

/** No longer renders anything — kept so imports don't break */
export function UnsavedChangesModal() { return null; }
