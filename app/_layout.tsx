import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import '@/i18n';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ProfileProvider, useProfile } from '@/contexts/ProfileContext';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { registerBackgroundHealthSync, triggerHealthSyncNow } from '@/services/backgroundHealthSync';

function RootNavigator() {
  const { session, isLoading: authLoading } = useAuth();
  const { isOnboardingComplete, isLoading: profileLoading } = useProfile();
  const router = useRouter();
  const segments = useSegments();
  const colorScheme = useColorScheme();

  const isLoading = authLoading || profileLoading;

  // Register background health sync once on mount
  useEffect(() => {
    registerBackgroundHealthSync();
  }, []);

  // Trigger a foreground sync whenever the user signs in
  useEffect(() => {
    if (session?.user?.id) {
      triggerHealthSyncNow(session.user.id).catch(() => {});
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';
    const inTabsGroup = segments[0] === '(tabs)';

    if (!session) {
      // Not signed in — go to auth
      if (!inAuthGroup) {
        router.replace('/(auth)/sign-in');
      }
    } else if (!isOnboardingComplete) {
      // Signed in but not onboarded
      if (!inOnboardingGroup) {
        router.replace('/(onboarding)');
      }
    } else {
      // Fully set up — go to tabs (allow modal routes like ai-chat)
      const inModalRoute = segments[0] === 'ai-chat';
      if (!inTabsGroup && !inModalRoute) {
        router.replace('/(tabs)');
      }
    }
  }, [session, isOnboardingComplete, isLoading, segments, router]);

  if (isLoading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <RootNavigator />
      </ProfileProvider>
    </AuthProvider>
  );
}
