import { useState, useEffect } from 'react';
import { HealthData } from '@/types';
import { getHealthDataRange, saveHealthData } from '@/services/database';
import { isHealthConnected, fetchTodayHealthData } from '@/services/healthKit';
import { useAuth } from '@/contexts/AuthContext';

export function useHealthHistory(days = 7): {
  history: HealthData[];
  isLoading: boolean;
} {
  const { user } = useAuth();
  const [history, setHistory] = useState<HealthData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const data = await getHealthDataRange(user!.id, days);
        if (!cancelled) setHistory(data);

        // If HealthKit is connected, sync today if we don't have it yet
        const connected = await isHealthConnected();
        if (!connected || cancelled) return;

        const today = new Date().toISOString().split('T')[0];
        const alreadyHaveToday = data.some((d) => d.date === today);
        if (alreadyHaveToday) return;

        const fresh = await fetchTodayHealthData(user!.id, today);
        const hasData = Object.entries(fresh).some(
          ([k, v]) => k !== 'user_id' && k !== 'date' && v !== null
        );
        if (!hasData || cancelled) return;

        await saveHealthData(fresh as Omit<HealthData, 'id'>);
        const updated = await getHealthDataRange(user!.id, days);
        if (!cancelled) setHistory(updated);
      } catch {
        // Health data is best-effort — don't surface errors
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user, days]);

  return { history, isLoading };
}
