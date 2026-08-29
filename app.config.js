const { withAndroidManifest } = require('@expo/config-plugins');

const isAndroid = process.env.EAS_BUILD_PLATFORM === 'android';

// RevenueCat's Android SDK pulls in Google Play Billing, which transitively depends on
// play-services-code-scanner. That library's own manifest declares
// GmsBarcodeScanningDelegateActivity with a hardcoded PORTRAIT lock — Spondy never uses
// barcode scanning at all, but Google's large-screen policy scan flags it anyway since
// it ships inside the final APK regardless. Override the inherited attribute via the
// standard Android manifest-merger tools:replace mechanism (there's no way to configure
// this from our own code otherwise — it's declared inside the library's AAR).
function withBarcodeScannerOrientationFix(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const application = manifest.application?.[0];
    if (!application) return config;

    const activityName = 'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity';
    application.activity = application.activity ?? [];
    const alreadyPresent = application.activity.some((a) => a.$['android:name'] === activityName);
    if (!alreadyPresent) {
      application.activity.push({
        $: {
          'android:name': activityName,
          'android:screenOrientation': 'unspecified',
          'tools:replace': 'android:screenOrientation',
        },
      });
    }

    return config;
  });
}

module.exports = {
  expo: {
    name: 'Spondy',
    slug: 'spondy',
    version: '1.1.0',
    // No top-level `orientation` lock — that sets android:screenOrientation="portrait"
    // in the manifest, which Google's large-screen policy flags (blocks resizability on
    // tablets/foldables/Chromebooks). iOS keeps its existing portrait-only behavior via
    // the explicit infoPlist override below; Android is locked to portrait at runtime
    // instead (src/hooks/useLockPortraitOnPhones.ts), only on phone-sized screens.
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
        NSHealthUpdateUsageDescription:
          'Spondy may write workout and symptom data to Apple Health.',
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ['fetch'],
        // Preserves the app's prior portrait-only behavior now that the top-level
        // `orientation` config key (which set this for both platforms) is gone.
        UISupportedInterfaceOrientations: [
          'UIInterfaceOrientationPortrait',
          'UIInterfaceOrientationPortraitUpsideDown',
        ],
      },
    },
    android: {
      versionCode: 9,
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
      'expo-font',
      'expo-web-browser',
      'expo-localization',
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
      // Android-only plugins
      ...(isAndroid ? ['react-native-health-connect'] : []),
      [
        'expo-build-properties',
        {
          android: {
            // Health Connect requires API 26+
            minSdkVersion: 26,
          },
        },
      ],
      'expo-background-fetch',
      'expo-task-manager',
      // NOT a separate '@sentry/react-native' entry — it resolves to the same
      // plugin as '@sentry/react-native/expo' below, and createRunOncePlugin
      // dedupes by package name, so an earlier unconfigured entry silently wins
      // and this org/project config never applies (found via a real prebuild).
      [
        '@sentry/react-native/expo',
        {
          url: 'https://sentry.io/',
          project: 'spondy',
          organization: 'spondy',
        },
      ],
      '@react-native-community/datetimepicker',
      // NOT '@react-native-firebase/app' — its config plugin is incompatible with
      // this project's bare-workflow iOS build (see May 2026 fix commit). Firebase
      // is wired manually in ios/Spondy/AppDelegate.swift and the Podfile instead.
      'expo-updates',
      withBarcodeScannerOrientationFix,
    ],
    updates: {
      url: 'https://u.expo.dev/d0cda471-dc65-4d6c-b28c-d6e9dde174e6',
      enabled: true,
      fallbackToCacheTimeout: 0,
      checkAutomatically: 'ON_LOAD',
    },
    runtimeVersion: '1.1.0',
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
