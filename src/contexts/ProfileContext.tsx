import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { UserProfile } from '@/types';
import { supabase } from '@/services/supabase';
import { useAuth } from './AuthContext';

interface ProfileContextValue {
  profile: UserProfile | null;
  isLoading: boolean;
  isOnboardingComplete: boolean;
  saveProfile: (updates: Partial<UserProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = row not found, which is fine for new users
        console.error('Error fetching profile:', error);
      }

      setProfile(data as UserProfile | null);
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const saveProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!user) throw new Error('No authenticated user');

      const profileData = {
        ...updates,
        user_id: user.id,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('profiles')
        .upsert(profileData, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) throw error;
      setProfile(data as UserProfile);
    },
    [user]
  );

  const refreshProfile = useCallback(async () => {
    await fetchProfile();
  }, [fetchProfile]);

  const isOnboardingComplete = profile?.onboarding_complete === true;

  return (
    <ProfileContext.Provider
      value={{
        profile,
        isLoading,
        isOnboardingComplete,
        saveProfile,
        refreshProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return ctx;
}
