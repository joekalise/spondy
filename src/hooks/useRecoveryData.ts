import { useState, useEffect, useCallback } from 'react';
import { RecoverySnapshot } from '@/types';
import { isHealthConnected, fetchTodayRecoveryData, ensureLatestHealthPermissions } from '@/services/healthKit';

export function useRecoveryData(): { data: RecoverySnapshot | null; refresh: () => void } {
  const [data, setData] = useState<RecoverySnapshot | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const connected = await isHealthConnected();
        if (!connected || cancelled) return;
        await ensureLatestHealthPermissions();
        if (cancelled) return;
        const today = new Date().toISOString().split('T')[0];
        const snapshot = await fetchTodayRecoveryData(today);
        const hasAny =
          snapshot.oxygen_saturation !== null ||
          snapshot.respiratory_rate !== null ||
          snapshot.mindful_minutes !== null;
        if (!cancelled && hasAny) setData(snapshot);
      } catch {}
    }
    load();
    return () => { cancelled = true; };
  }, [tick]);

  return { data, refresh };
}
