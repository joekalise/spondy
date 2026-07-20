const isAndroid = process.env.EAS_BUILD_PLATFORM === 'android';

module.exports = {
  expo: {
    name: 'Spondy',
    slug: 'spondy',
    version: '1.0.1',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#F97316',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.spondy.app',
      googleServicesFile: './GoogleService-Info.plist',
      infoPlist: {
        NSHealthShareUsageDescription:
          'Spondy reads your health data to identify patterns that may relate to your AS symptoms.',
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ['fetch', 'processing'],
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#F97316',
      },
      package: 'com.spondy.app',
      googleServicesFile: './google-services.json',
      permissions: [
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.WAKE_LOCK',
      ],
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#F97316',
        },
      ],
      // iOS-only plugins
      ...(!isAndroid ? [['expo-apple-authentication']] : []),
      ...(!isAndroid ? ['react-native-health'] : []),
      'expo-background-fetch',
      'expo-task-manager',
      '@sentry/react-native',
      [
        '@sentry/react-native/expo',
        {
          url: 'https://sentry.io/',
          project: 'spondy',
          organization: 'spondy',
        },
      ],
      '@react-native-community/datetimepicker',
      '@react-native-firebase/app',
      'expo-updates',
    ],
    updates: {
      url: 'https://u.expo.dev/d0cda471-dc65-4d6c-b28c-d6e9dde174e6',
      enabled: true,
      fallbackToCacheTimeout: 0,
      checkAutomatically: 'ON_LOAD',
    },
    runtimeVersion: '1.0.0',
    scheme: 'spondy',
    extra: {
      router: {
        origin: false,
      },
      eas: {
        projectId: 'd0cda471-dc65-4d6c-b28c-d6e9dde174e6',
      },
    },
    owner: 'jbrockbanks-organization',
  },
};
