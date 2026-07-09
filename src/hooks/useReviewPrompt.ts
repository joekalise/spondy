import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_DISMISSED_AT = '@spondy_review_dismissed_at';
const KEY_COMPLETED = '@spondy_review_completed';

const MIN_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;        // 90 days after dismissal

interface ReviewPromptState {
  shouldShow: boolean;
  markCompleted: () => Promise<void>;
  markDismissed: () => Promise<void>;
}

export function useReviewPrompt(
  userCreatedAt: string | undefined,
  isActiveUser: boolean, // true when user has logged at least once (streak > 0 or todayLogged)
): ReviewPromptState {
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    if (!userCreatedAt || !isActiveUser) return;

    const accountAgeMs = Date.now() - new Date(userCreatedAt).getTime();
    if (accountAgeMs < MIN_ACCOUNT_AGE_MS) return;

    (async () => {
      const [completed, dismissedAt] = await Promise.all([
        AsyncStorage.getItem(KEY_COMPLETED),
        AsyncStorage.getItem(KEY_DISMISSED_AT),
      ]);

      if (completed === 'true') return;

      if (dismissedAt) {
        const msSinceDismissal = Date.now() - new Date(dismissedAt).getTime();
        if (msSinceDismissal < COOLDOWN_MS) return;
      }

      setShouldShow(true);
    })();
  }, [userCreatedAt, isActiveUser]);

  const markCompleted = useCallback(async () => {
    setShouldShow(false);
    await AsyncStorage.setItem(KEY_COMPLETED, 'true');
  }, []);

  const markDismissed = useCallback(async () => {
    setShouldShow(false);
    await AsyncStorage.setItem(KEY_DISMISSED_AT, new Date().toISOString());
  }, []);

  return { shouldShow, markCompleted, markDismissed };
}
