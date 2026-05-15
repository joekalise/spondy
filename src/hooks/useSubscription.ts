import { useState, useEffect, useCallback } from 'react';
import {
  getSubscriptionStatus,
  purchasePremium,
  restorePurchases,
  getMonthlyPriceString,
} from '@/services/revenuecat';

export function useSubscription(): {
  isSubscribed: boolean;
  isInTrial: boolean;
  isLoading: boolean;
  monthlyPrice: string | null;
  trialDays: number | null;
  purchase: () => Promise<boolean>;
  restore: () => Promise<boolean>;
} {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isInTrial, setIsInTrial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [monthlyPrice, setMonthlyPrice] = useState<string | null>(null);
  const [trialDays, setTrialDays] = useState<number | null>(null);

  const loadStatus = useCallback(async () => {
    // In dev, unlock premium so AI features can be tested before IAP is configured
    if (__DEV__) {
      setIsSubscribed(true);
      setIsInTrial(true);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [status, priceInfo] = await Promise.all([
        getSubscriptionStatus(),
        getMonthlyPriceString(),
      ]);
      setIsSubscribed(status.isSubscribed);
      setIsInTrial(status.isInTrial);
      setMonthlyPrice(priceInfo.price);
      setTrialDays(priceInfo.trialDays);
    } catch (err) {
      console.error('useSubscription: failed to load status', err);
      setIsSubscribed(false);
      setIsInTrial(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const purchase = useCallback(async (): Promise<boolean> => {
    const success = await purchasePremium();
    if (success) {
      const status = await getSubscriptionStatus();
      setIsSubscribed(status.isSubscribed);
      setIsInTrial(status.isInTrial);
    }
    return success;
  }, []);

  const restore = useCallback(async (): Promise<boolean> => {
    try {
      const success = await restorePurchases();
      if (success) {
        const status = await getSubscriptionStatus();
        setIsSubscribed(status.isSubscribed);
        setIsInTrial(status.isInTrial);
      }
      return success;
    } catch (err) {
      console.error('useSubscription: restore failed', err);
      return false;
    }
  }, []);

  return { isSubscribed, isInTrial, isLoading, monthlyPrice, trialDays, purchase, restore };
}
