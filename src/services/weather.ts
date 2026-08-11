import AsyncStorage from '@react-native-async-storage/async-storage';

export type HumidityTrend = 'rising' | 'falling' | 'stable';

export interface HumidityData {
  humidity: number; // % relative humidity
  trend: HumidityTrend;
  fetchedAt: string; // YYYY-MM-DD
}

const CACHE_KEY = '@spondy_humidity_cache';

export async function getCachedHumidity(): Promise<HumidityData | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const parsed: HumidityData = JSON.parse(cached);
    const today = new Date().toISOString().split('T')[0];
    return parsed.fetchedAt === today ? parsed : null;
  } catch {
    return null;
  }
}

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    fetch(url)
      .then((r) => { clearTimeout(timer); resolve(r); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

async function getCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
  const services: Array<() => Promise<{ latitude: number; longitude: number } | null>> = [
    async () => {
      const res = await fetchWithTimeout('https://ipapi.co/json/', 6000);
      const j = await res.json();
      if (typeof j.latitude === 'number' && typeof j.longitude === 'number') {
        return { latitude: j.latitude, longitude: j.longitude };
      }
      return null;
    },
    async () => {
      const res = await fetchWithTimeout('https://ipwho.is/', 6000);
      const j = await res.json();
      if (j.success && typeof j.latitude === 'number' && typeof j.longitude === 'number') {
        return { latitude: j.latitude, longitude: j.longitude };
      }
      return null;
    },
  ];

  for (const service of services) {
    try {
      const coords = await service();
      if (coords) return coords;
    } catch {
      // try next
    }
  }
  return null;
}

export async function fetchHumidity(): Promise<HumidityData> {
  const cached = await getCachedHumidity();
  if (cached) return cached;

  const coords = await getCoordinates();
  if (!coords) throw new Error('Could not determine location');

  const { latitude, longitude } = coords;
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
    `&current=relative_humidity_2m&hourly=relative_humidity_2m&forecast_days=1&timezone=auto`;

  const res = await fetchWithTimeout(url, 10000);
  const json = await res.json();

  const currentHumidity: number = json.current?.relative_humidity_2m;
  if (currentHumidity === undefined || currentHumidity === null) {
    throw new Error(`Bad response: ${JSON.stringify(json).slice(0, 200)}`);
  }

  const times: string[] = json.hourly?.time ?? [];
  const humidities: number[] = json.hourly?.relative_humidity_2m ?? [];
  const now = new Date();
  const todayPrefix = now.toISOString().split('T')[0];
  const hourStr = String(now.getHours()).padStart(2, '0');
  const currentIdx = times.findIndex((t) => t === `${todayPrefix}T${hourStr}:00`);

  let trend: HumidityTrend = 'stable';
  const futureIdx = currentIdx + 6;
  if (currentIdx >= 0 && futureIdx < humidities.length) {
    const diff = humidities[futureIdx] - currentHumidity;
    if (diff > 5) trend = 'rising';
    else if (diff < -5) trend = 'falling';
  }

  const data: HumidityData = {
    humidity: Math.round(currentHumidity),
    trend,
    fetchedAt: todayPrefix,
  };

  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
  return data;
}
