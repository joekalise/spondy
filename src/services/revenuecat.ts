import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? 'appl_FDnYALlJtpZOVLglvgPEmWBxlHx';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

let _configured = false;
let _configureError: string | null = null;

export function configureRevenueCat(): void {
  if (__DEV__) return; // dev builds mock subscription
  if (_configured) return;
  const apiKey = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
  if (!apiKey) return;
  try {
    Purchases.configure({ apiKey });
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    _configured = true;
    _configureError = null;
  } catch (e) {
    _configureError = e instanceof Error ? e.message : String(e);
  }
}

export function getConfigureError(): string | null {
  return _configureError;
}

export async function loginRevenueCat(userId: string): Promise<void> {
  if (_configureError) return;
  try {
    await Purchases.logIn(userId);
  } catch {
    // login failure is non-fatal
  }
}

export async function initializeRevenueCat(userId?: string): Promise<void> {
  configureRevenueCat();
  if (userId) await loginRevenueCat(userId);
}

export async function getSubscriptionStatus(): Promise<{
  isSubscribed: boolean;
  isInTrial: boolean;
}> {
  if (_configureError) return { isSubscribed: false, isInTrial: false };
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
  if (_configureError) throw new Error(`RC configure error: ${_configureError}`);
  try {
    const offerings = await Purchases.getOfferings();
    const currentOffering = offerings.current;
    if (!currentOffering) throw new Error(`RC: no current offering (all: ${JSON.stringify(Object.keys(offerings.all))})`);

    const monthlyPackage = currentOffering.monthly;
    if (!monthlyPackage) throw new Error(`RC: no monthly package (packages: ${JSON.stringify(currentOffering.availablePackages.map(p => p.identifier))})`);

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

export async function getMonthlyPriceString(): Promise<{
  price: string | null;
  trialDays: number | null;
}> {
  if (_configureError) return { price: null, trialDays: null };
  try {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.monthly;
    if (!pkg) return { price: null, trialDays: null };

    const price = pkg.product.priceString ?? null;
    const intro = pkg.product.introPrice;
    let trialDays: number | null = null;
    if (intro && intro.price === 0) {
      // Convert intro period to days
      const units = intro.periodNumberOfUnits ?? 1;
      switch (intro.periodUnit) {
        case 'DAY':   trialDays = units; break;
        case 'WEEK':  trialDays = units * 7; break;
        case 'MONTH': trialDays = units * 30; break;
        default:      trialDays = units;
      }
    }
    return { price, trialDays };
  } catch {
    return { price: null, trialDays: null };
  }
}

export async function restorePurchases(): Promise<boolean> {
  if (_configureError) return false;
  try {
    const customerInfo = await Purchases.restorePurchases();
    return Object.keys(customerInfo.entitlements.active).length > 0;
  } catch {
    return false;
  }
}
