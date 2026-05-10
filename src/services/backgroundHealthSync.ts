import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { supabase } from './supabase';
import { fetchTodayHealthData, isHealthConnected } from './healthKit';
import { saveHealthData } from './database';

const TASK_NAME = 'SPONDY_HEALTH_SYNC';

function localDateString(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Must be defined at module level for TaskManager
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const connected = await isHealthConnected();
    if (!connected) return BackgroundFetch.BackgroundFetchResult.NoData;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return BackgroundFetch.BackgroundFetchResult.NoData;

    const userId = session.user.id;
    const datesToSync = [localDateString(0), localDateString(1)];

    for (const date of datesToSync) {
      const snapshot = await fetchTodayHealthData(userId, date);
      const hasData = snapshot.steps !== null || snapshot.sleep_duration !== null || snapshot.hrv !== null;
      if (hasData) {
        await saveHealthData(snapshot);
      }
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundHealthSync(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(TASK_NAME, {
        minimumInterval: 60 * 60 * 12, // 12 hours
        stopOnTerminate: false,
        startOnBoot: false,
      });
    }
  } catch {
    // Background fetch not available in Expo Go or simulators
  }
}

export async function triggerHealthSyncNow(userId: string): Promise<void> {
  const connected = await isHealthConnected();
  if (!connected) return;

  const datesToSync = [localDateString(0), localDateString(1)];
  for (const date of datesToSync) {
    const snapshot = await fetchTodayHealthData(userId, date);
    const hasData = snapshot.steps !== null || snapshot.sleep_duration !== null || snapshot.hrv !== null;
    if (hasData) {
      await saveHealthData(snapshot);
    }
  }
}
