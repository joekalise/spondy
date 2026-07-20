import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { HealthData } from '@/types';
import {
  isHealthKitAvailable,
  isHealthConnected,
  requestHealthPermissions,
  fetchTodayHealthData,
  disconnectHealth,
  reinitHealthKit,
  HealthSnapshot,
} from '@/services/healthKit';
import { saveHealthData, getTodayHealthData } from '@/services/database';
import { useAuth } from '@/contexts/AuthContext';

export interface UseHealthDataResult {
  isAvailable: boolean;
  isConnected: boolean;
  isLoading: boolean;
  todayData: HealthSnapshot | null;
  connect: () => Promise<boolean>;
  sync: () => Promise<void>;
  disconnect: () => Promise<void>;
  recheck: () => Promise<void>;
}

export function useHealthData(): UseHealthDataResult {
  const { user } = useAuth();
  const [isAvailable, setIsAvailable] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [todayData, setTodayData] = useState<HealthSnapshot | null>(null);
  const connectedRef = useRef(false);
  const availableRef = useRef(false);

  const loadData = useCallback(async (userId: string, cancelled: () => boolean) => {
    const today = new Date().toISOString().split('T')[0];

    // Fast path: Supabase cache
    try {
      const cached = await getTodayHealthData(userId, today);
      if (cached && !cancelled()) setTodayData(cached);
    } catch {}

    // Fresh path: HealthKit, with a short delay to let triggerHealthSyncNow finish first
    await new Promise((r) => setTimeout(r, 800));
    if (cancelled()) return;

    try {
      // Try Supabase again first — triggerHealthSyncNow may have finished by now
      const cached2 = await getTodayHealthData(userId, today);
      if (cached2 && !cancelled()) {
        setTodayData(cached2);
        return;
      }
    } catch {}

    try {
      const fresh = await fetchTodayHealthData(userId, today);
      if (cancelled()) return;
      const hasData = Object.entries(fresh).some(
        ([k, v]) => k !== 'user_id' && k !== 'date' && v !== null
      );
      if (hasData) {
        setTodayData(fresh);
        await saveHealthData(fresh as Omit<HealthData, 'id'>);
      }
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setIsLoading(true);
      try {
        const available = await isHealthKitAvailable();
        if (cancelled) return;
        setIsAvailable(available);
        availableRef.current = available;

        const connected = await isHealthConnected();
        if (cancelled) return;
        setIsConnected(connected);
        connectedRef.current = connected;

        if (!available || !connected || !user) return;
        await reinitHealthKit();
        await loadData(user.id, () => cancelled);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [user, loadData]);

  // Re-sync when app comes back to foreground
  useEffect(() => {
    if (!user) return;
    const handleAppState = (next: AppStateStatus) => {
      if (next === 'active' && connectedRef.current && availableRef.current) {
        let cancelled = false;
        loadData(user.id, () => cancelled).catch(() => {});
        return () => { cancelled = true; };
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [user, loadData]);

  const sync = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const fresh = await fetchTodayHealthData(user.id, today);
      const hasData = Object.entries(fresh).some(
        ([k, v]) => k !== 'user_id' && k !== 'date' && v !== null
      );
      if (hasData) {
        setTodayData(fresh);
        await saveHealthData(fresh as Omit<HealthData, 'id'>);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const connect = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const granted = await requestHealthPermissions();
      if (granted) {
        setIsConnected(true);
        await sync();
      }
      return granted;
    } finally {
      setIsLoading(false);
    }
  }, [sync]);

  const disconnect = useCallback(async () => {
    await disconnectHealth();
    setIsConnected(false);
    setTodayData(null);
  }, []);

  const recheck = useCallback(async () => {
    const connected = await isHealthConnected();
    if (!connected) {
      setIsConnected(false);
      setTodayData(null);
      return;
    }
    if (!user) return;
    let cancelled = false;
    await loadData(user.id, () => cancelled);
  }, [user, loadData]);

  return { isAvailable, isConnected, isLoading, todayData, connect, sync, disconnect, recheck };
}
