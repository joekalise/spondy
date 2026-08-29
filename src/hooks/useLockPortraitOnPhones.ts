import { useEffect } from 'react';
import { Platform, Dimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

// Google's large-screen device threshold: 600dp on the shortest side covers
// tablets, foldables (unfolded), and Chromebooks. Below that, treat it as a phone.
const LARGE_SCREEN_THRESHOLD_DP = 600;

function isPhoneSized(): boolean {
  const { width, height } = Dimensions.get('window');
  return Math.min(width, height) < LARGE_SCREEN_THRESHOLD_DP;
}

// Android has no manifest-level orientation lock (removed so the app satisfies
// Play's large-screen resizability policy — a locked android:screenOrientation
// blocks proper tablet/foldable support). iOS keeps its native portrait lock via
// UISupportedInterfaceOrientations in app.config.js, so this only needs to run
// on Android, and only actually locks when the screen is phone-sized — large
// screens stay freely rotatable, satisfying the policy for real, not just on paper.
export function useLockPortraitOnPhones(): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!isPhoneSized()) return;

    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
  }, []);
}
