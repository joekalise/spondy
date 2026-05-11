import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HealthData } from '@/types';

const HEALTH_CONNECTED_KEY = '@spondy_health_connected';

function getHK(): any | null {
  if (Platform.OS !== 'ios') return null;
  try {
    const mod = require('react-native-health');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

function p<T>(fn: (cb: (err: any, result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((err, result) => (err ? reject(new Error(String(err))) : resolve(result)));
  });
}

export async function isHealthKitAvailable(): Promise<boolean> {
  return getHK() !== null;
}

export async function isHealthConnected(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(HEALTH_CONNECTED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  const hk = getHK();
  if (!hk) return false;

  const permissions = {
    permissions: {
      read: [
        hk.Constants.Permissions.Steps,
        hk.Constants.Permissions.SleepAnalysis,
        hk.Constants.Permissions.HeartRate,
        hk.Constants.Permissions.HeartRateVariability,
        hk.Constants.Permissions.ActiveEnergyBurned,
        hk.Constants.Permissions.Workout,
      ],
      write: [],
    },
  };

  try {
    await p<void>((cb) => hk.initHealthKit(permissions, cb));
    await AsyncStorage.setItem(HEALTH_CONNECTED_KEY, 'true');
    return true;
  } catch {
    return false;
  }
}

export async function disconnectHealth(): Promise<void> {
  await AsyncStorage.removeItem(HEALTH_CONNECTED_KEY);
}

export type HealthSnapshot = Omit<HealthData, 'id'>;

export async function fetchTodayHealthData(
  userId: string,
  date: string
): Promise<HealthSnapshot> {
  const hk = getHK();
  const base: HealthSnapshot = {
    user_id: userId,
    date,
    steps: null,
    sleep_duration: null,
    sleep_quality: null,
    hrv: null,
    resting_heart_rate: null,
    active_calories: null,
    workouts: null,
  };

  if (!hk) return base;

  const dayStart = new Date(`${date}T00:00:00`).toISOString();
  const dayEnd = new Date(`${date}T23:59:59`).toISOString();
  const opts = { startDate: dayStart, endDate: dayEnd };

  // Steps
  try {
    const s = await p<{ value: number }>((cb) => hk.getStepCount(opts, cb));
    base.steps = Math.round(s.value);
  } catch {}

  // Sleep — window: previous evening 18:00 → current noon 12:00
  try {
    const sleepStart = new Date(`${date}T00:00:00`);
    sleepStart.setDate(sleepStart.getDate() - 1);
    sleepStart.setHours(18, 0, 0, 0);
    const sleepEnd = new Date(`${date}T12:00:00`);

    const samples = await p<Array<{ startDate: string; endDate: string; value: number }>>(
      (cb) =>
        hk.getSleepSamples(
          { startDate: sleepStart.toISOString(), endDate: sleepEnd.toISOString() },
          cb
        )
    );

    // react-native-health may return value as string or number depending on version,
    // so normalise with Number(). Values: 0=InBed, 1=Asleep, 2=Awake, 3=Core, 4=Deep, 5=REM.
    // Multiple sources (Watch + sleep apps) write overlapping samples — merge intervals
    // so the same moment is never double-counted.

    function mergedMs(src: Array<{ startDate: string; endDate: string }>): number {
      if (src.length === 0) return 0;
      const sorted = [...src].sort(
        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );
      let total = 0;
      let curStart = new Date(sorted[0].startDate).getTime();
      let curEnd   = new Date(sorted[0].endDate).getTime();
      for (let i = 1; i < sorted.length; i++) {
        const s = new Date(sorted[i].startDate).getTime();
        const e = new Date(sorted[i].endDate).getTime();
        if (s <= curEnd) { curEnd = Math.max(curEnd, e); }
        else { total += curEnd - curStart; curStart = s; curEnd = e; }
      }
      return total + (curEnd - curStart);
    }

    const nonAwake    = samples.filter(s => Number(s.value) !== 2);
    const sleeping    = nonAwake.filter(s => Number(s.value) !== 0); // exclude InBed
    const samplesToUse = sleeping.length > 0 ? sleeping : nonAwake;  // fall back to InBed only

    const totalMs   = mergedMs(samplesToUse);
    const deepRemMs = mergedMs(samplesToUse.filter(s => Number(s.value) === 4 || Number(s.value) === 5));
    const hasStages = samplesToUse.some(s => Number(s.value) >= 3);

    // Sanity cap: anything over 14h is almost certainly bogus overlapping data
    const cappedMs = Math.min(totalMs, 14 * 3_600_000);
    base.sleep_duration = cappedMs > 0 ? Math.round((cappedMs / 3_600_000) * 10) / 10 : null;
    base.sleep_quality  = hasStages && totalMs > 0
      ? Math.round((deepRemMs / totalMs) * 100)
      : null;
  } catch {}

  // Heart rate (average of day's samples)
  try {
    const samples = await p<Array<{ value: number }>>((cb) =>
      hk.getHeartRateSamples({ ...opts, ascending: false, limit: 50 }, cb)
    );
    if (samples.length > 0) {
      base.resting_heart_rate = Math.round(
        samples.reduce((sum, s) => sum + s.value, 0) / samples.length
      );
    }
  } catch {}

  // HRV (SDNN in ms — average of day's samples)
  try {
    const samples = await p<Array<{ value: number }>>((cb) =>
      hk.getHeartRateVariabilitySamples({ ...opts, ascending: false, limit: 10 }, cb)
    );
    if (samples.length > 0) {
      const avgSeconds = samples.reduce((sum, s) => sum + s.value, 0) / samples.length;
      base.hrv = Math.round(avgSeconds * 1000 * 10) / 10; // convert s → ms
    }
  } catch {}

  // Active calories
  try {
    const samples = await p<Array<{ value: number }>>((cb) =>
      hk.getActiveEnergyBurned(opts, cb)
    );
    base.active_calories = Math.round(samples.reduce((sum, s) => sum + s.value, 0));
  } catch {}

  // Workouts — count sessions
  try {
    const ws = await p<Array<unknown>>((cb) => hk.getWorkouts(opts, cb));
    base.workouts = ws.length;
  } catch {}

  return base;
}
