import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/contexts/ProfileContext';

function storageKey(userId: string) {
  return `@spondy_tracks_medication_${userId}`;
}

export function useMedicationTracking(): {
  tracks: boolean;
  isLoading: boolean;
  setTracks: (value: boolean) => Promise<void>;
} {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [tracks, setTracksState] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    const key = storageKey(user.id);
    AsyncStorage.getItem(key).then((raw) => {
      if (raw !== null) {
        setTracksState(raw === 'true');
      } else if (profile) {
        // First run: derive default from onboarding choice
        const noMeds = profile.medications?.includes('no_medication') ?? false;
        const defaultValue = !noMeds;
        setTracksState(defaultValue);
        AsyncStorage.setItem(key, String(defaultValue)).catch(() => {});
      }
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, [user, profile]);

  const setTracks = useCallback(async (value: boolean) => {
    if (!user) return;
    setTracksState(value);
    await AsyncStorage.setItem(storageKey(user.id), String(value));
  }, [user]);

  return { tracks, isLoading, setTracks };
}
