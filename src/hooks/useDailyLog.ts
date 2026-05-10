import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDailyLog, saveDailyLog as dbSaveLog, getStreak } from '@/services/database';
import { DailyLog } from '@/types';

function getLocalDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useDailyLog(): {
  todayLog: DailyLog | null;
  todayLogged: boolean;
  streak: number;
  isLoading: boolean;
  error: string | null;
  saveLog: (log: Omit<DailyLog, 'id' | 'user_id' | 'date'>) => Promise<void>;
  refresh: () => Promise<void>;
} {
  const { user } = useAuth();
  const [todayLog, setTodayLog] = useState<DailyLog | null>(null);
  const [streak, setStreak] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    // Always compute fresh so stale tabs don't use yesterday's date
    const today = getLocalDateString();

    setIsLoading(true);
    setError(null);

    try {
      const [log, currentStreak] = await Promise.all([
        getDailyLog(user.id, today),
        getStreak(user.id),
      ]);
      setTodayLog(log);
      setStreak(currentStreak);
    } catch (err) {
      console.error('useDailyLog load error:', err);
      setError('Failed to load today\'s check-in.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const saveLog = useCallback(
    async (logData: Omit<DailyLog, 'id' | 'user_id' | 'date'>) => {
      if (!user) throw new Error('No authenticated user');

      const today = getLocalDateString();

      const fullLog: Omit<DailyLog, 'id'> = {
        ...logData,
        user_id: user.id,
        date: today,
      };

      const saved = await dbSaveLog(fullLog);
      setTodayLog(saved);

      const newStreak = await getStreak(user.id);
      setStreak(newStreak);
    },
    [user]
  );

  return {
    todayLog,
    todayLogged: todayLog !== null,
    streak,
    isLoading,
    error,
    saveLog,
    refresh: load,
  };
}
