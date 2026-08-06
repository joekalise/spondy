import React, { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, useColorScheme, Platform } from 'react-native';
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans';
import { FontFamily } from '@/constants/theme';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';

// Set up Android notification channel with HIGH importance so Doze mode
// doesn't batch or delay daily reminders.
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('spondy-reminders', {
    name: 'Spondy reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  }).catch(() => {});
}

// Keep the native splash up until we've confirmed the correct route is showing.
// This prevents any JS-rendered flash on cold start (especially visible on Android).
SplashScreen.preventAutoHideAsync().catch(() => {});

import '@/i18n';
import { configureRevenueCat } from '@/services/revenuecat';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

// Configure RevenueCat immediately — before auth resolves
configureRevenueCat();
import { ProfileProvider, useProfile } from '@/contexts/ProfileContext';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { UpdateBanner } from '@/components/common/UpdateBanner';
import { registerBackgroundHealthSync, triggerHealthSyncNow } from '@/services/backgroundHealthSync';
import { scheduleDailyCheckIn, cancelLapseNotification } from '@/services/notifications';
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
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function RootNavigator() {
  const { session, isLoading: authLoading } = useAuth();
  const { profile, isOnboardingComplete, isLoading: profileLoading } = useProfile();
  const router = useRouter();
  const segments = useSegments();
  const colorScheme = useColorScheme();

  const isLoading = authLoading || profileLoading;
  // isReady stays false until segments actually reflect the target route.
  // router.replace() is async — segments update on the NEXT render after the call,
  // so we must not show the Stack until we confirm arrival at the right place.
  const [isReady, setIsReady] = useState(false);
  const isFirstNavRef = useRef(true);
  const pendingNotificationScreenRef = useRef<string | null>(null);

  const inAuthGroup = segments[0] === '(auth)';
  const inOnboardingGroup = segments[0] === '(onboarding)';
  const inTabsGroup = segments[0] === '(tabs)';
  const inModalRoute = segments[0] === 'ai-chat';

  // Check for OTA update on every cold start and apply immediately if available
  useEffect(() => {
    if (__DEV__) return;
    Updates.checkForUpdateAsync()
      .then(({ isAvailable }) => {
        if (!isAvailable) return;
        return Updates.fetchUpdateAsync().then(() => Updates.reloadAsync());
      })
      .catch(() => {});
  }, []);

  // Register background health sync once on mount
  useEffect(() => {
    registerBackgroundHealthSync();
  }, []);

  // Route to the screen a notification points at (via its `screen` data field),
  // whether it was tapped while the app was running/backgrounded, or the tap is
  // what cold-started the app.
  useEffect(() => {
    function handleResponse(response: Notifications.NotificationResponse) {
      const screen = response.notification.request.content.data?.screen as string | undefined;
      if (!screen) return;
      if (isReady) {
        router.push(screen);
      } else {
        pendingNotificationScreenRef.current = screen;
      }
    }

    // Clear after reading so a normal reopen days later doesn't re-trigger
    // navigation based on a stale cached tap.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleResponse(response);
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
      }
    });
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => subscription.remove();
  }, [isReady, router]);

  // Flush a notification tap that arrived before routing settled (cold start).
  useEffect(() => {
    if (!isReady || !pendingNotificationScreenRef.current) return;
    router.push(pendingNotificationScreenRef.current);
    pendingNotificationScreenRef.current = null;
  }, [isReady, router]);

  // Reschedule daily check-in for existing users if not already scheduled
  useEffect(() => {
    if (!session || !isOnboardingComplete || !profile?.notification_time) return;
    Notifications.getAllScheduledNotificationsAsync().then((scheduled) => {
      const hasCheckin = scheduled.some((n) => n.identifier === 'daily-checkin');
      if (!hasCheckin) scheduleDailyCheckIn(profile.notification_time).catch(() => {});
    }).catch(() => {});
    // User opened the app — cancel any lapse re-engagement notification
    cancelLapseNotification().catch(() => {});
  }, [session?.user?.id, isOnboardingComplete, profile?.notification_time]);

  // Trigger a foreground sync whenever the user signs in
  useEffect(() => {
    if (session?.user?.id) {
      triggerHealthSyncNow(session.user.id).catch(() => {});
      setUserId(session.user.id).catch(() => {});
    } else {
      setUserId(null).catch(() => {});
    }
  }, [session?.user?.id]);

  // Route guard: fires whenever auth/profile state or segments change.
  // On the first navigation only, we wait until segments actually match the
  // target before marking isReady — router.replace() is async and segments
  // update one render later, so marking ready immediately causes a flash.
  useEffect(() => {
    if (isLoading) return;

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/sign-in');
    } else if (!isOnboardingComplete) {
      if (!inOnboardingGroup) router.replace('/(onboarding)');
    } else {
      if (!inTabsGroup && !inModalRoute) router.replace('/(tabs)');
    }

    if (isFirstNavRef.current) {
      const target = !session ? '(auth)' : !isOnboardingComplete ? '(onboarding)' : '(tabs)';
      const arrived = segments[0] === target || (target === '(tabs)' && inModalRoute);
      if (arrived) {
        isFirstNavRef.current = false;
        setIsReady(true);
        SplashScreen.hideAsync().catch(() => {});
      }
      // Not arrived yet: segments will update → effect re-fires → we check again
    }
  }, [session, isOnboardingComplete, isLoading, segments, router]);

  // Keep spinner until confirmed at the right route on cold start.
  // Do NOT gate on profileLoading here — saveProfile toggles profileLoading
  // mid-onboarding and we must not unmount the Stack during that window.
  if (!isReady) {
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
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  if (!fontsLoaded) return null;

  Text.defaultProps = Text.defaultProps ?? {};
  Text.defaultProps.style = { fontFamily: FontFamily.regular };

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ProfileProvider>
          <RootNavigator />
        </ProfileProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
});
