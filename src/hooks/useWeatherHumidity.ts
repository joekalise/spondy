import { useState, useEffect, useCallback } from 'react';
import { getCachedHumidity, fetchHumidity, HumidityData } from '@/services/weather';
import { saveHumidity } from '@/services/database';
import { useAuth } from '@/contexts/AuthContext';

export function useWeatherHumidity() {
  const { user } = useAuth();
  const [humidity, setHumidity] = useState<HumidityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    getCachedHumidity()
      .then((cached) => {
        if (cached) {
          setHumidity(cached);
          setIsLoading(false);
        } else {
          // No cache — fetch immediately, no tap required
          setIsLoading(false);
          setIsFetching(true);
          fetchHumidity()
            .then((data) => setHumidity(data))
            .catch(() => setFetchError(true))
            .finally(() => setIsFetching(false));
        }
      })
      .catch(() => {
        setHumidity(null);
        setIsLoading(false);
      });
  }, []);

  const refresh = useCallback(async () => {
    if (isFetching) return;
    setIsFetching(true);
    setFetchError(false);
    try {
      const data = await fetchHumidity();
      setHumidity(data);
    } catch {
      setFetchError(true);
    } finally {
      setIsFetching(false);
    }
  }, [isFetching]);

  // Persist each day's reading so it can be correlated against pain/fatigue
  // logs at a lag later — a same-day cache alone can't answer "was it humid
  // a few days before this flare?".
  useEffect(() => {
    if (!user || !humidity) return;
    saveHumidity(user.id, humidity.fetchedAt, humidity.humidity).catch(() => {});
  }, [user, humidity]);

  return { humidity, isLoading, isFetching, fetchError, refresh };
}
