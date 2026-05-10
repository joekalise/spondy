import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

export async function initializeRevenueCat(userId?: string): Promise<void> {
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  const apiKey =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY!
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY!;

  // Skip initialisation if no key or test key on a real device build
  if (!apiKey || (apiKey.startsWith('test_') && !__DEV__)) return;

  await Purchases.configure({ apiKey });

  if (userId) {
    await Purchases.logIn(userId);
  }
}

export async function getSubscriptionStatus(): Promise<{
  isSubscribed: boolean;
  isInTrial: boolean;
}> {
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
  try {
    const offerings = await Purchases.getOfferings();
    const currentOffering = offerings.current;
    if (!currentOffering) return false;

    const monthlyPackage = currentOffering.monthly;
    if (!monthlyPackage) return false;

    await Purchases.purchasePackage(monthlyPackage);
    return true;
  } catch (error: unknown) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'userCancelled' in error &&
      !(error as { userCancelled: boolean }).userCancelled
    ) {
      throw error;
    }
    return false;
  }
}

export async function restorePurchases(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return Object.keys(customerInfo.entitlements.active).length > 0;
  } catch {
    return false;
  }
}
