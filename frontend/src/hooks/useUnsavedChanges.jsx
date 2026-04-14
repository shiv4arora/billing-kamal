import { useEffect, useCallback } from 'react';

/**
 * Works with BrowserRouter (no useBlocker).
 * Returns confirmLeave() — call before navigate() to prompt if dirty.
 * Also blocks browser tab close / reload when dirty.
 */
export function useUnsavedChanges(isDirty) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const confirmLeave = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm('You have unsaved changes. Leave anyway?');
  }, [isDirty]);

  return confirmLeave;
}

/** No longer renders anything — kept so imports don't break */
export function UnsavedChangesModal() { return null; }
