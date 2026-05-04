import { useEffect, useCallback } from 'react';

/**
 * Blocks browser refresh/close when dirty.
 * Returns confirmLeave() — call before navigate() to prompt if dirty.
 */
export function useUnsavedChanges(isDirty) {
  // Block browser refresh / tab close
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const confirmLeave = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm('You have unsaved changes. Leave without saving?');
  }, [isDirty]);

  // savePromptJsx kept for API compatibility — blocker removed (caused blank screen)
  return { confirmLeave, savePromptJsx: null };
}

/** Kept so imports don't break */
export function UnsavedChangesModal() { return null; }
