import { useState, useEffect, useCallback } from 'react';
import { getCachedHumidity, fetchHumidity, HumidityData } from '@/services/weather';

export function useWeatherHumidity() {
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

  return { humidity, isLoading, isFetching, fetchError, refresh };
}
