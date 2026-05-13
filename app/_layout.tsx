import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, useColorScheme } from 'react-native';
import * as Notifications from 'expo-notifications';

import '@/i18n';
import { configureRevenueCat } from '@/services/revenuecat';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

// Configure RevenueCat immediately — before auth resolves
configureRevenueCat();
import { ProfileProvider, useProfile } from '@/contexts/ProfileContext';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { UpdateBanner } from '@/components/common/UpdateBanner';
import { registerBackgroundHealthSync, triggerHealthSyncNow } from '@/services/backgroundHealthSync';
import { setUserId } from '@/services/analytics';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://8abbabe2fad0e65279837042df5da6f6@o4511371993350144.ingest.de.sentry.io/4511371996758096',
  enableLogs: true,
  // Session replay disabled — health app with sensitive user data
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

// Show notifications when app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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
      setUserId(session.user.id).catch(() => {});
    } else {
      setUserId(null).catch(() => {});
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
    <View style={{ flex: 1 }}>
      <UpdateBanner />
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </View>
  );
}

export default Sentry.wrap(function RootLayout() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <RootNavigator />
      </ProfileProvider>
    </AuthProvider>
  );
});
