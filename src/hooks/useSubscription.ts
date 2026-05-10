import { useState, useEffect, useCallback } from 'react';
import {
  getSubscriptionStatus,
  purchasePremium,
  restorePurchases,
} from '@/services/revenuecat';

export function useSubscription(): {
  isSubscribed: boolean;
  isInTrial: boolean;
  isLoading: boolean;
  purchase: () => Promise<boolean>;
  restore: () => Promise<boolean>;
} {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isInTrial, setIsInTrial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
      const status = await getSubscriptionStatus();
      setIsSubscribed(status.isSubscribed);
      setIsInTrial(status.isInTrial);
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
    try {
      const success = await purchasePremium();
      if (success) {
        // Re-fetch status after purchase to reflect latest state
        const status = await getSubscriptionStatus();
        setIsSubscribed(status.isSubscribed);
        setIsInTrial(status.isInTrial);
      }
      return success;
    } catch (err) {
      console.error('useSubscription: purchase failed', err);
      return false;
    }
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

  return { isSubscribed, isInTrial, isLoading, purchase, restore };
}
