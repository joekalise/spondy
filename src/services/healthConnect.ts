import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HealthData, RecoverySnapshot } from '@/types';

const HEALTH_CONNECTED_KEY = '@spondy_health_connected_android';
// Bump this when new permission types are added so existing users get re-prompted.
const HEALTH_PERMISSIONS_VERSION = 1;
const HEALTH_PERMISSIONS_VERSION_KEY = '@spondy_health_connect_permissions_version';

function getHC(): any | null {
  if (Platform.OS !== 'android') return null;
  try {
    return require('react-native-health-connect');
  } catch {
    return null;
  }
}

const PERMISSIONS: Array<{ accessType: 'read'; recordType: string }> = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'OxygenSaturation' },
  { accessType: 'read', recordType: 'RespiratoryRate' },
  { accessType: 'read', recordType: 'MindfulnessSession' },
];

export async function isHealthKitAvailable(): Promise<boolean> {
  const hc = getHC();
  if (!hc) return false;
  try {
    const status = await hc.getSdkStatus();
    return status === hc.SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

export async function isHealthConnected(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(HEALTH_CONNECTED_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  const hc = getHC();
  if (!hc) return false;

  try {
    await hc.initialize();
    const granted = await hc.requestPermission(PERMISSIONS);
    const ok = granted.length > 0;
    if (ok) {
      await AsyncStorage.setItem(HEALTH_CONNECTED_KEY, 'true');
      await AsyncStorage.setItem(HEALTH_PERMISSIONS_VERSION_KEY, String(HEALTH_PERMISSIONS_VERSION));
    }
    return ok;
  } catch {
    return false;
  }
}

export async function disconnectHealth(): Promise<void> {
  // Health Connect's revokeAllPermissions doesn't take effect until the app
  // restarts (documented platform limitation), so it's unsuitable as the
  // backing action for an in-app toggle. Just stop syncing locally instead —
  // the user can revoke access from the Health Connect app if they want to.
  await AsyncStorage.removeItem(HEALTH_CONNECTED_KEY);
  await AsyncStorage.removeItem(HEALTH_PERMISSIONS_VERSION_KEY);
}

// Silently re-requests when new permission types have been added.
// Health Connect only prompts for types not yet granted — already-granted ones pass silently.
export async function ensureLatestHealthPermissions(): Promise<void> {
  const connected = await isHealthConnected();
  if (!connected) return;
  try {
    const stored = await AsyncStorage.getItem(HEALTH_PERMISSIONS_VERSION_KEY);
    if (Number(stored) >= HEALTH_PERMISSIONS_VERSION) return;
    await requestHealthPermissions();
  } catch {}
}

export type HealthSnapshot = Omit<HealthData, 'id'>;

function mergedMs(src: Array<{ startTime: string; endTime: string }>): number {
  if (src.length === 0) return 0;
  const sorted = [...src].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  let total = 0;
  let curStart = new Date(sorted[0].startTime).getTime();
  let curEnd = new Date(sorted[0].endTime).getTime();
  for (let i = 1; i < sorted.length; i++) {
    const s = new Date(sorted[i].startTime).getTime();
    const e = new Date(sorted[i].endTime).getTime();
    if (s <= curEnd) {
      curEnd = Math.max(curEnd, e);
    } else {
      total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    }
  }
  return total + (curEnd - curStart);
}

export async function fetchTodayHealthData(
  userId: string,
  date: string
): Promise<HealthSnapshot> {
  const hc = getHC();
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

  if (!hc) return base;

  const dayStart = new Date(`${date}T00:00:00`).toISOString();
  const dayEnd = new Date(`${date}T23:59:59`).toISOString();
  const dayFilter = { timeRangeFilter: { operator: 'between' as const, startTime: dayStart, endTime: dayEnd } };

  // Steps
  try {
    const { records } = await hc.readRecords('Steps', dayFilter);
    base.steps = Math.round(records.reduce((sum: number, r: any) => sum + r.count, 0));
  } catch {}

  // Sleep — window: previous evening 18:00 → current noon 12:00, same as iOS.
  try {
    const sleepStart = new Date(`${date}T00:00:00`);
    sleepStart.setDate(sleepStart.getDate() - 1);
    sleepStart.setHours(18, 0, 0, 0);
    const sleepEnd = new Date(`${date}T12:00:00`);

    const { records } = await hc.readRecords('SleepSession', {
      timeRangeFilter: { operator: 'between', startTime: sleepStart.toISOString(), endTime: sleepEnd.toISOString() },
    });

    // Stage values (SleepStageType): 0=Unknown, 1=Awake, 2=Sleeping, 3=OutOfBed, 4=Light, 5=Deep, 6=REM.
    // Multiple sources can write overlapping sessions/stages — merge intervals so the
    // same moment is never double-counted, mirroring the iOS implementation.
    const allStages: Array<{ startTime: string; endTime: string; stage: number }> = records.flatMap(
      (r: any) => r.stages ?? []
    );

    if (allStages.length > 0) {
      const nonAwake = allStages.filter((s) => s.stage !== 1 && s.stage !== 3);
      const totalMs = mergedMs(nonAwake);
      const deepRemMs = mergedMs(nonAwake.filter((s) => s.stage === 5 || s.stage === 6));
      const hasStages = nonAwake.some((s) => s.stage === 4 || s.stage === 5 || s.stage === 6);

      const cappedMs = Math.min(totalMs, 14 * 3_600_000);
      base.sleep_duration = cappedMs > 0 ? Math.round((cappedMs / 3_600_000) * 10) / 10 : null;
      base.sleep_quality = hasStages && totalMs > 0 ? Math.round((deepRemMs / totalMs) * 100) : null;
    } else if (records.length > 0) {
      // No stage breakdown available — fall back to session span.
      const totalMs = mergedMs(records);
      const cappedMs = Math.min(totalMs, 14 * 3_600_000);
      base.sleep_duration = cappedMs > 0 ? Math.round((cappedMs / 3_600_000) * 10) / 10 : null;
    }
  } catch {}

  // Heart rate (average of day's samples)
  try {
    const { records } = await hc.readRecords('HeartRate', dayFilter);
    const samples = records.flatMap((r: any) => r.samples ?? []);
    if (samples.length > 0) {
      base.resting_heart_rate = Math.round(
        samples.reduce((sum: number, s: any) => sum + s.beatsPerMinute, 0) / samples.length
      );
    }
  } catch {}

  // HRV (rMSSD in ms — average of day's samples). Health Connect already
  // reports this in milliseconds, unlike HealthKit which uses seconds.
  try {
    const { records } = await hc.readRecords('HeartRateVariabilityRmssd', dayFilter);
    if (records.length > 0) {
      const avg = records.reduce((sum: number, r: any) => sum + r.heartRateVariabilityMillis, 0) / records.length;
      base.hrv = Math.round(avg * 10) / 10;
    }
  } catch {}

  // Active calories
  try {
    const { records } = await hc.readRecords('ActiveCaloriesBurned', dayFilter);
    base.active_calories = Math.round(
      records.reduce((sum: number, r: any) => sum + (r.energy?.inKilocalories ?? 0), 0)
    );
  } catch {}

  // Workouts — count sessions
  try {
    const { records } = await hc.readRecords('ExerciseSession', dayFilter);
    base.workouts = records.length;
  } catch {}

  return base;
}

export async function fetchTodayRecoveryData(date: string): Promise<RecoverySnapshot> {
  const hc = getHC();
  const base: RecoverySnapshot = {
    oxygen_saturation: null,
    respiratory_rate: null,
    mindful_minutes: null,
  };

  if (!hc) return base;

  // Sleep window: previous evening 20:00 → current morning 10:00.
  // SpO2 and respiratory rate are most meaningful during sleep, same as iOS.
  const sleepStart = new Date(`${date}T00:00:00`);
  sleepStart.setDate(sleepStart.getDate() - 1);
  sleepStart.setHours(20, 0, 0, 0);
  const sleepEnd = new Date(`${date}T10:00:00`);
  const sleepFilter = {
    timeRangeFilter: { operator: 'between' as const, startTime: sleepStart.toISOString(), endTime: sleepEnd.toISOString() },
  };

  // SpO2 — average overnight reading. Health Connect reports 0-100 already.
  try {
    const { records } = await hc.readRecords('OxygenSaturation', sleepFilter);
    if (records.length > 0) {
      const avg = records.reduce((sum: number, r: any) => sum + r.percentage, 0) / records.length;
      base.oxygen_saturation = Math.round(avg);
    }
  } catch {}

  // Respiratory rate — average overnight reading
  try {
    const { records } = await hc.readRecords('RespiratoryRate', sleepFilter);
    if (records.length > 0) {
      const avg = records.reduce((sum: number, r: any) => sum + r.rate, 0) / records.length;
      base.respiratory_rate = Math.round(avg * 10) / 10;
    }
  } catch {}

  // Mindful minutes — total session duration today
  try {
    const dayStart = new Date(`${date}T00:00:00`).toISOString();
    const dayEnd = new Date(`${date}T23:59:59`).toISOString();
    const { records } = await hc.readRecords('MindfulnessSession', {
      timeRangeFilter: { operator: 'between', startTime: dayStart, endTime: dayEnd },
    });
    if (records.length > 0) {
      const totalMs = records.reduce(
        (sum: number, r: any) => sum + (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()),
        0
      );
      base.mindful_minutes = Math.round(totalMs / 60000) || null;
    }
  } catch {}

  return base;
}
