import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { DailyLog, MedicationReminder, RecoverySnapshot } from '@/types';
import { supabase } from '@/services/supabase';
import i18n from '@/i18n';

const ANDROID_CHANNEL = 'spondy-reminders';

function androidChannel() {
  return Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {};
}

export const NOTIFICATION_SCREEN = {
  dailyCheckin: '/(tabs)/track',
  medication: '/(tabs)/track',
  lapse: '/(tabs)/track',
  flare: '/(tabs)/flares',
  basdaiReminder: '/(tabs)/insights?openBasdai=1',
  nudge: '/(tabs)/insights',
} as const;

// ─── Permissions ─────────────────────────────────────────────────────────────

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ─── Daily check-in reminder ─────────────────────────────────────────────────

export async function scheduleDailyCheckIn(timeString: string): Promise<void> {
  await cancelNotification('daily-checkin');

  const [hourStr, minuteStr] = timeString.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  if (isNaN(hour) || isNaN(minute)) return;

  await Notifications.scheduleNotificationAsync({
    identifier: 'daily-checkin',
    content: {
      title: i18n.t('notifications.checkin_title') as string,
      body: i18n.t('notifications.checkin_body') as string,
      sound: true,
      data: { screen: NOTIFICATION_SCREEN.dailyCheckin },
      ...androidChannel(),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export interface CheckInContext {
  painScore: number;
  fatigueScore: number;
  stiffness: string | null;
  streak: number;
}

function buildPersonalizedCheckInContent(ctx: CheckInContext): { title: string; body: string } {
  const { painScore, fatigueScore, stiffness, streak } = ctx;
  const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts as any) as string;

  if (streak >= 7) {
    return {
      title: `🔥 ${t('notifications.streak_title', { count: streak })}`,
      body: t('notifications.streak_body'),
    };
  }
  if (stiffness === 'over_2_hours' || stiffness === '1_2_hours') {
    return {
      title: t('notifications.stiffness_title'),
      body: t('notifications.stiffness_body'),
    };
  }
  if (painScore >= 7) {
    return {
      title: t('notifications.high_pain_title', { score: painScore }),
      body: t('notifications.high_pain_body'),
    };
  }
  if (fatigueScore >= 7) {
    return {
      title: t('notifications.high_fatigue_title'),
      body: t('notifications.high_fatigue_body', { score: fatigueScore }),
    };
  }
  if (painScore <= 2 && fatigueScore <= 3) {
    return {
      title: t('notifications.good_day_title'),
      body: t('notifications.good_day_body'),
    };
  }
  if (streak >= 3) {
    return {
      title: t('notifications.streak_short_title', { count: streak }),
      body: t('notifications.streak_short_body'),
    };
  }
  return {
    title: t('notifications.checkin_title'),
    body: t('notifications.checkin_body'),
  };
}

// Cancels today's check-in and schedules a personalized one-time trigger for tomorrow.
// Called after saving today's log so the reminder doesn't fire when already logged.
export async function scheduleDailyCheckInFromTomorrow(
  timeString: string,
  ctx?: CheckInContext
): Promise<void> {
  await cancelNotification('daily-checkin');

  const [hourStr, minuteStr] = timeString.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);
  if (isNaN(hour) || isNaN(minute)) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(hour, minute, 0, 0);

  const content = ctx ? buildPersonalizedCheckInContent(ctx) : {
    title: i18n.t('notifications.checkin_title') as string,
    body: i18n.t('notifications.checkin_body') as string,
  };

  await Notifications.scheduleNotificationAsync({
    identifier: 'daily-checkin',
    content: { ...content, sound: true, data: { screen: NOTIFICATION_SCREEN.dailyCheckin }, ...androidChannel() },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: tomorrow,
    },
  });
}

// Schedules a re-engagement push 48h from now. Cancel on next app open.
// Fires only if the user goes quiet after logging today.
export async function scheduleLapseNotification(): Promise<void> {
  await cancelNotification('lapse-reengagement');
  const fireAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await Notifications.scheduleNotificationAsync({
    identifier: 'lapse-reengagement',
    content: {
      title: i18n.t('notifications.lapse_title') as string,
      body: i18n.t('notifications.lapse_body') as string,
      sound: true,
      data: { screen: NOTIFICATION_SCREEN.lapse },
      ...androidChannel(),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  });
}

export async function cancelLapseNotification(): Promise<void> {
  await cancelNotification('lapse-reengagement');
}

// ─── BASDAI monthly reassessment reminder ─────────────────────────────────────

// Fires 30 days after lastScoreDate, matching the in-app "due" threshold (see
// isDue = daysSince >= 30 in insights.tsx). Anchored to the actual last score
// date rather than "now" so it's safe to call repeatedly (e.g. on every app
// open) — it cancels and reschedules each time, self-healing if the OS ever
// drops the underlying scheduled notification.
export async function scheduleBasdaiReminder(lastScoreDate: string): Promise<void> {
  await cancelNotification('basdai-reminder');

  const fireAt = new Date(lastScoreDate);
  fireAt.setDate(fireAt.getDate() + 30);

  const now = new Date();
  if (fireAt <= now) {
    // Already overdue — remind soon rather than scheduling in the past.
    fireAt.setTime(now.getTime() + 24 * 60 * 60 * 1000);
  }

  await Notifications.scheduleNotificationAsync({
    identifier: 'basdai-reminder',
    content: {
      title: i18n.t('notifications.basdai_reminder_title') as string,
      body: i18n.t('notifications.basdai_reminder_body') as string,
      sound: true,
      data: { screen: NOTIFICATION_SCREEN.basdaiReminder },
      ...androidChannel(),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
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

  if (!med.active || med.as_needed) return;

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
        title: i18n.t('notifications.med_title', { name: med.name }) as string,
        body: i18n.t('notifications.med_body', { dose: med.dose, name: med.name }) as string,
        sound: true,
        data: { screen: NOTIFICATION_SCREEN.medication },
        ...androidChannel(),
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
        title: i18n.t('notifications.med_title', { name: med.name }) as string,
        body: i18n.t('notifications.med_body', { dose: med.dose, name: med.name }) as string,
        sound: true,
        data: { screen: NOTIFICATION_SCREEN.medication },
        ...androidChannel(),
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
        title: i18n.t('notifications.med_title', { name: med.name }) as string,
        body: i18n.t('notifications.med_body', { dose: med.dose, name: med.name }) as string,
        sound: true,
        data: { screen: NOTIFICATION_SCREEN.medication },
        ...androidChannel(),
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

  const title = level === 'warning' ? i18n.t('notifications.flare_warning_title') as string : i18n.t('notifications.flare_watch_title') as string;
  const body =
    level === 'warning'
      ? i18n.t('notifications.flare_warning_body') as string
      : i18n.t('notifications.flare_watch_body') as string;

  await sendNudge(title, body, NOTIFICATION_SCREEN.flare);
  await AsyncStorage.setItem(key, level);
}

// ─── Nudge ────────────────────────────────────────────────────────────────────

export async function sendNudge(title: string, body: string, screen: string = NOTIFICATION_SCREEN.nudge): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true, data: { screen }, ...androidChannel() },
    trigger: null, // fire immediately
  });
}

// ─── Nudge evaluation ─────────────────────────────────────────────────────────

let nudgeCheckInFlight = false;

export async function evaluateAndSendNudges(
  userId: string,
  logs: DailyLog[],
  recovery?: RecoverySnapshot | null
): Promise<void> {
  if (logs.length < 3) return;
  if (nudgeCheckInFlight) return;

  nudgeCheckInFlight = true;
  try {
    await evaluateAndSendNudgesInternal(userId, logs, recovery);
  } finally {
    nudgeCheckInFlight = false;
  }
}

async function evaluateAndSendNudgesInternal(
  userId: string,
  logs: DailyLog[],
  recovery?: RecoverySnapshot | null
): Promise<void> {
  // Check max 1 nudge per day
  const todayCount = await getTodayNudgeCount(userId);
  if (todayCount > 0) return;

  const recent = logs.slice(-3); // last 3 days

  // Rule 1: 3+ days of over_2_hours morning stiffness → sleep nudge
  const poorSleepDays = recent.filter(
    (l) => l.stiffness_duration === 'over_2_hours'
  ).length;
  if (poorSleepDays >= 3) {
    const message = i18n.t('notifications.nudge_sleep_body') as string;
    await sendNudge(i18n.t('notifications.nudge_sleep_title') as string, message);
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
    const message = i18n.t('notifications.nudge_pain_body') as string;
    await sendNudge(i18n.t('notifications.nudge_pain_title') as string, message);
    await saveNudgeToDb(userId, 'pain_rising', message);
    return;
  }

  // Rule 3: Fatigue >= 7 for 3+ days
  const highFatigueDays = recent.filter((l) => l.fatigue_score >= 7).length;
  if (highFatigueDays >= 3) {
    const message = i18n.t('notifications.nudge_energy_body') as string;
    await sendNudge(i18n.t('notifications.nudge_energy_title') as string, message);
    await saveNudgeToDb(userId, 'fatigue', message);
    return;
  }

  // Rule 4: mood 'low' or 'very_low' for 3+ days
  const lowMoodDays = recent.filter(
    (l) => l.mood === 'low' || l.mood === 'very_low'
  ).length;
  if (lowMoodDays >= 3) {
    const message = i18n.t('notifications.nudge_mood_body') as string;
    await sendNudge(i18n.t('notifications.nudge_mood_title') as string, message);
    await saveNudgeToDb(userId, 'mood', message);
    return;
  }

  // Rule 5: poor diet quality on 3 consecutive days
  const poorDietDays = recent.filter(
    (l) => l.diet_quality === 'poor' || l.diet_quality === 'mixed'
  ).length;
  if (poorDietDays >= 3) {
    const message = i18n.t('notifications.nudge_diet_body') as string;
    await sendNudge(i18n.t('notifications.nudge_diet_title') as string, message);
    await saveNudgeToDb(userId, 'diet', message);
    return;
  }

  // Rule 6: alcohol logged 3+ of last 3 days
  const alcoholDays = recent.filter(
    (l) => (l.diet_triggers ?? []).includes('alcohol')
  ).length;
  if (alcoholDays >= 3) {
    const message = i18n.t('notifications.nudge_diet_alcohol_body') as string;
    await sendNudge(i18n.t('notifications.nudge_diet_title') as string, message);
    await saveNudgeToDb(userId, 'diet_alcohol', message);
    return;
  }

  // Rule 7: low overnight SpO₂ (from HealthKit)
  if (recovery?.oxygen_saturation !== null && recovery?.oxygen_saturation !== undefined) {
    if (recovery.oxygen_saturation < 94) {
      const message = i18n.t('notifications.nudge_spo2_body', { value: recovery.oxygen_saturation }) as string;
      await sendNudge(i18n.t('notifications.nudge_spo2_title') as string, message);
      await saveNudgeToDb(userId, 'low_spo2', message);
      return;
    }
  }

  // Rule 8: elevated sleep respiratory rate (from HealthKit)
  if (recovery?.respiratory_rate !== null && recovery?.respiratory_rate !== undefined) {
    if (recovery.respiratory_rate > 20) {
      const message = i18n.t('notifications.nudge_resp_body', { value: recovery.respiratory_rate }) as string;
      await sendNudge(i18n.t('notifications.nudge_resp_title') as string, message);
      await saveNudgeToDb(userId, 'elevated_resp_rate', message);
      return;
    }
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
