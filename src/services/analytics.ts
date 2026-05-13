import analytics from '@react-native-firebase/analytics';

// Only log in production. __DEV__ is true in Expo Go / dev builds.
const enabled = !__DEV__;

export async function logEvent(name: string, params?: Record<string, string | number | boolean>): Promise<void> {
  if (!enabled) return;
  try {
    await analytics().logEvent(name, params);
  } catch {
    // analytics failures are never fatal
  }
}

export async function logScreen(screenName: string): Promise<void> {
  if (!enabled) return;
  try {
    await analytics().logScreenView({ screen_name: screenName, screen_class: screenName });
  } catch {}
}

export async function setUserId(userId: string | null): Promise<void> {
  if (!enabled) return;
  try {
    await analytics().setUserId(userId);
  } catch {}
}

// ─── Named events ─────────────────────────────────────────────────────────────

export const Events = {
  // Auth
  SIGN_IN:              'sign_in',
  SIGN_UP:              'sign_up',
  SIGN_OUT:             'sign_out',

  // Onboarding
  ONBOARDING_STARTED:   'onboarding_started',
  ONBOARDING_COMPLETE:  'onboarding_complete',

  // Logging
  DAY_LOGGED:           'day_logged',

  // Premium
  PREMIUM_MODAL_OPENED: 'premium_modal_opened',
  PURCHASE_STARTED:     'purchase_started',
  PURCHASE_SUCCESS:     'purchase_success',
  PURCHASE_CANCELLED:   'purchase_cancelled',
  PURCHASE_ERROR:       'purchase_error',
  RESTORE_SUCCESS:      'restore_success',

  // AI
  AI_INSIGHT_GENERATED: 'ai_insight_generated',
  AI_CHAT_OPENED:       'ai_chat_opened',
  AI_CHAT_MESSAGE_SENT: 'ai_chat_message_sent',

  // Features
  FLARE_LOGGED:         'flare_logged',
  REPORT_GENERATED:     'report_generated',
  MEDICATION_ADDED:     'medication_added',
  HEALTH_SYNC:          'health_sync',

  // Updates
  OTA_UPDATE_APPLIED:   'ota_update_applied',
} as const;
