import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { DailyLog, MedicationReminder } from '@/types';
import { supabase } from '@/services/supabase';

// ─── Permissions ─────────────────────────────────────────────────────────────

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Daily check-in reminder ─────────────────────────────────────────────────

export async function scheduleDailyCheckIn(timeString: string): Promise<void> {
  // Cancel existing before scheduling new
  await cancelNotification('daily-checkin');

  const [hourStr, minuteStr] = timeString.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (isNaN(hour) || isNaN(minute)) return;

  await Notifications.scheduleNotificationAsync({
    identifier: 'daily-checkin',
    content: {
      title: 'Time for your daily check-in',
      body: "How are you feeling today? Take 60 seconds to log your symptoms.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

// ─── Cancel notifications by identifier prefix ────────────────────────────────

export async function cancelNotification(identifier: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const matching = scheduled.filter((n) =>
    n.identifier.startsWith(identifier)
  );
  await Promise.all(
    matching.map((n) =>
      Notifications.cancelScheduledNotificationAsync(n.identifier)
    )
  );
}

// ─── Medication reminder ──────────────────────────────────────────────────────

export async function scheduleMedicationReminder(med: MedicationReminder): Promise<void> {
  if (!med.id) return;

  const identifier = `med-${med.id}`;
  await cancelNotification(identifier);

  if (!med.active) return;

  const [hourStr, minuteStr] = med.reminder_time.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (isNaN(hour) || isNaN(minute)) return;

  // For daily: fire every day. For other frequencies, schedule daily and let the
  // app handle skipping (expo-notifications doesn't support weekly/fortnightly
  // native triggers on all platforms without a custom approach).
  // We use a weekly trigger for weekly, and daily for others as a best effort.
  if (med.frequency === 'daily') {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `Time for ${med.name}`,
        body: `Don't forget your ${med.dose} dose of ${med.name}.`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } else if (med.frequency === 'weekly') {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `Time for ${med.name}`,
        body: `Don't forget your ${med.dose} dose of ${med.name}.`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 2, // Monday
        hour,
        minute,
      },
    });
  } else {
    // Fortnightly and monthly — schedule daily reminder; app can filter logic
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `Time for ${med.name}`,
        body: `Don't forget your ${med.dose} dose of ${med.name}.`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  }
}

// ─── Flare early warning notification ────────────────────────────────────────

export async function sendFlareWarningIfNeeded(
  userId: string,
  level: 'watch' | 'warning'
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const key = `@spondy_flare_alert_${userId}_${today}`;

  const lastSent = await AsyncStorage.getItem(key);
  // Don't downgrade or repeat at the same level today
  if (lastSent === 'warning') return;
  if (lastSent === 'watch' && level === 'watch') return;

  const title = level === 'warning' ? '⚠️ Possible flare building' : '👀 Symptoms to watch';
  const body =
    level === 'warning'
      ? 'Several patterns suggest a flare may be building. Consider resting and reviewing your medications.'
      : 'A couple of signals suggest your body might be under stress. Keep a close eye on your symptoms.';

  await sendNudge(title, body);
  await AsyncStorage.setItem(key, level);
}

// ─── Nudge ────────────────────────────────────────────────────────────────────

export async function sendNudge(title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: null, // fire immediately
  });
}

// ─── Nudge evaluation ─────────────────────────────────────────────────────────

export async function evaluateAndSendNudges(
  userId: string,
  logs: DailyLog[]
): Promise<void> {
  if (logs.length < 3) return;

  // Check max 1 nudge per day
  const todayCount = await getTodayNudgeCount(userId);
  if (todayCount > 0) return;

  const recent = logs.slice(-3); // last 3 days

  // Rule 1: 3+ days of over_2_hours morning stiffness → sleep nudge
  const poorSleepDays = recent.filter(
    (l) => l.stiffness_duration === 'over_2_hours'
  ).length;
  if (poorSleepDays >= 3) {
    const message =
      "Your sleep has been disrupted recently. An early night tonight might help.";
    await sendNudge('Sleep check', message);
    await saveNudgeToDb(userId, 'sleep', message);
    return;
  }

  // Rule 2: Pain rising 3+ consecutive days
  const last3Pain = recent.map((l) => l.pain_score);
  const painRising =
    last3Pain.length === 3 &&
    last3Pain[1] > last3Pain[0] &&
    last3Pain[2] > last3Pain[1];
  if (painRising) {
    const message =
      "Pain has been creeping up. How's your sleep and stress been?";
    await sendNudge('Pain check', message);
    await saveNudgeToDb(userId, 'pain_rising', message);
    return;
  }

  // Rule 3: Fatigue >= 7 for 3+ days
  const highFatigueDays = recent.filter((l) => l.fatigue_score >= 7).length;
  if (highFatigueDays >= 3) {
    const message =
      "Your energy has been low for a few days. Take it easy and get some rest.";
    await sendNudge('Energy check', message);
    await saveNudgeToDb(userId, 'fatigue', message);
    return;
  }

  // Rule 4: mood 'low' or 'very_low' for 3+ days
  const lowMoodDays = recent.filter(
    (l) => l.mood === 'low' || l.mood === 'very_low'
  ).length;
  if (lowMoodDays >= 3) {
    const message =
      "Things have been tough lately. Be kind to yourself. Even a short gentle walk can help.";
    await sendNudge('Mood check', message);
    await saveNudgeToDb(userId, 'mood', message);
    return;
  }

  // Rule 5: poor diet quality on 3 consecutive days
  const poorDietDays = recent.filter(
    (l) => l.diet_quality === 'poor' || l.diet_quality === 'mixed'
  ).length;
  if (poorDietDays >= 3) {
    const message =
      "Your diet has been more inflammatory this week. Starchy, processed, or sugary foods can drive AS symptoms. Even small changes help.";
    await sendNudge('Diet check', message);
    await saveNudgeToDb(userId, 'diet', message);
    return;
  }

  // Rule 6: alcohol logged 3+ of last 3 days
  const alcoholDays = recent.filter(
    (l) => (l.diet_triggers ?? []).includes('alcohol')
  ).length;
  if (alcoholDays >= 3) {
    const message =
      "You've logged alcohol several days running. It's a known inflammation driver for AS. Your body might appreciate a break.";
    await sendNudge('Diet check', message);
    await saveNudgeToDb(userId, 'diet_alcohol', message);
    return;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getTodayNudgeCount(userId: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const { count, error } = await supabase
    .from('nudges')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('sent_at', `${today}T00:00:00.000Z`);

  if (error) return 0;
  return count ?? 0;
}

async function saveNudgeToDb(
  userId: string,
  triggerType: string,
  message: string
): Promise<void> {
  await supabase.from('nudges').insert({
    user_id: userId,
    sent_at: new Date().toISOString(),
    trigger_type: triggerType,
    message,
  });
}
