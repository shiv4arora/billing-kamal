import { useState, useEffect, useRef } from 'react';
import { api } from './useApi';

/**
 * Acquire an invoice lock on mount, renew every 4 minutes, release on unmount.
 * Returns { locked: bool, lockedBy: string } if someone else holds the lock.
 */
export function useInvoiceLock(type, id) {
  // type: 'sales' | 'purchases'
  const [lockState, setLockState] = useState({ checking: true, blocked: false, lockedBy: '' });
  const intervalRef = useRef(null);

  const acquire = async () => {
    if (!id) return;
    try {
      await api(`/${type}/${id}/lock`, { method: 'POST' });
      setLockState({ checking: false, blocked: false, lockedBy: '' });
    } catch (err) {
      if (err.status === 423) {
        setLockState({ checking: false, blocked: true, lockedBy: err.data?.lockedBy || 'Someone' });
      } else {
        // If lock endpoint fails (network etc), don't block — fail open
        setLockState({ checking: false, blocked: false, lockedBy: '' });
      }
    }
  };

  const release = () => {
    if (!id) return;
    // Fire-and-forget — use sendBeacon if available for reliability on page unload
    api(`/${type}/${id}/lock`, { method: 'DELETE' }).catch(() => {});
  };

  useEffect(() => {
    if (!id) { setLockState({ checking: false, blocked: false, lockedBy: '' }); return; }
    acquire();
    // Renew lock every 4 min (TTL is 10 min)
    intervalRef.current = setInterval(acquire, 4 * 60 * 1000);
    return () => {
      clearInterval(intervalRef.current);
      release();
    };
  }, [id]);

  return lockState;
}
