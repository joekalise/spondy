import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || 'appl_FDnYALlJtpZOVLglvgPEmWBxlHx';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || 'test_cmkTTrSkBGUWhtFodQGnqIwKCMo';

export function configureRevenueCat(): void {
  const apiKey = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
  if (!apiKey || (apiKey.startsWith('test_') && !__DEV__)) return;
  try {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey });
  } catch {
    // Already configured — safe to ignore
  }
}

export async function loginRevenueCat(userId: string): Promise<void> {
  if (!Purchases.isConfigured) return;
  await Purchases.logIn(userId);
}

export async function initializeRevenueCat(userId?: string): Promise<void> {
  configureRevenueCat();
  if (userId) await loginRevenueCat(userId);
}

export async function getSubscriptionStatus(): Promise<{
  isSubscribed: boolean;
  isInTrial: boolean;
}> {
  configureRevenueCat();
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const isSubscribed =
      customerInfo.activeSubscriptions.length > 0 ||
      Object.keys(customerInfo.entitlements.active).length > 0;
    const isInTrial = customerInfo.activeSubscriptions.some(
      sub => customerInfo.entitlements.active[sub]?.periodType === 'TRIAL'
    );
    return { isSubscribed, isInTrial };
  } catch {
    return { isSubscribed: false, isInTrial: false };
  }
}

export async function purchasePremium(): Promise<boolean> {
  configureRevenueCat();
  try {
    const offerings = await Purchases.getOfferings();
    const currentOffering = offerings.current;
    if (!currentOffering) throw new Error('RC: no current offering');

    const monthlyPackage = currentOffering.monthly;
    if (!monthlyPackage) throw new Error('RC: no monthly package');

    await Purchases.purchasePackage(monthlyPackage);
    return true;
  } catch (error: unknown) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'userCancelled' in error &&
      (error as { userCancelled: boolean }).userCancelled
    ) {
      return false;
    }
    throw error;
  }
}

export async function restorePurchases(): Promise<boolean> {
  configureRevenueCat();
  try {
    const customerInfo = await Purchases.restorePurchases();
    return Object.keys(customerInfo.entitlements.active).length > 0;
  } catch {
    return false;
  }
}
