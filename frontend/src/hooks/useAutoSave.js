import { useEffect, useRef, useState } from 'react';

/**
 * Debounces `data` changes and calls `saveFn` after `delay` ms.
 * Skips the very first render so it doesn't fire on mount.
 * Always calls the latest `saveFn` (via ref) to avoid stale closures.
 *
 * @returns {'idle'|'unsaved'|'saving'|'saved'|'error'} status
 */
export function useAutoSave(data, saveFn, { delay = 3000 } = {}) {
  const [status, setStatus] = useState('idle');
  const timerRef   = useRef(null);
  const firstRender = useRef(true);
  const saveFnRef  = useRef(saveFn);
  saveFnRef.current = saveFn;

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setStatus('unsaved');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setStatus('saving');
      try {
        await saveFnRef.current();
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, delay);
    return () => clearTimeout(timerRef.current);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  return status;
}

/** Small inline indicator — drop it anywhere in a form header. */
export function AutoSaveIndicator({ status }) {
  if (status === 'idle') return null;
  if (status === 'unsaved') return <span className="text-xs text-gray-400">● Unsaved</span>;
  if (status === 'saving')  return <span className="text-xs text-gray-400 flex items-center gap-1"><span className="inline-block animate-spin leading-none">↻</span> Saving…</span>;
  if (status === 'saved')   return <span className="text-xs text-green-600 font-medium">✓ Saved</span>;
  if (status === 'error')   return <span className="text-xs text-red-500">⚠ Auto-save failed</span>;
  return null;
}
