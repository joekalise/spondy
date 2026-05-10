import { useMemo } from 'react';
import { DailyLog, Flare, HealthData, Mood, DietTrigger } from '@/types';

export type FlareRiskLevel = 'none' | 'watch' | 'warning';

export interface FlareRisk {
  level: FlareRiskLevel;
  signals: string[];
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function moodToScore(mood: Mood | null): number {
  switch (mood) {
    case 'great': return 5;
    case 'good': return 4;
    case 'okay': return 3;
    case 'low': return 2;
    case 'very_low': return 1;
    default: return 3;
  }
}

export function computeFlareRisk(
  logs: DailyLog[],
  activeFlare: Flare | null,
  healthHistory?: HealthData[]
): FlareRisk {
  // Already in a flare — no separate warning needed
  if (activeFlare) return { level: 'none', signals: [] };
  if (logs.length < 3) return { level: 'none', signals: [] };

  const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const recentLogs = sortedLogs.slice(-3);
  const earlierLogs = sortedLogs.slice(-6, -3);

  const signals: string[] = [];

  // ── Symptom signals ──────────────────────────────────────────────────────────

  // 1. Pain trending up
  const recentPain = avg(recentLogs.map((l) => l.pain_score));
  if (earlierLogs.length >= 2) {
    const earlierPain = avg(earlierLogs.map((l) => l.pain_score));
    if (recentPain - earlierPain >= 1.5 && recentPain >= 4) signals.push('pain_rising');
  } else if (recentPain >= 6) {
    signals.push('pain_rising');
  }

  // 2. Fatigue trending up
  const recentFatigue = avg(recentLogs.map((l) => l.fatigue_score));
  if (earlierLogs.length >= 2) {
    const earlierFatigue = avg(earlierLogs.map((l) => l.fatigue_score));
    if (recentFatigue - earlierFatigue >= 1.5 && recentFatigue >= 5) signals.push('fatigue_rising');
  } else if (recentFatigue >= 7) {
    signals.push('fatigue_rising');
  }

  // 3. Prolonged morning stiffness on 2+ of the last 3 days
  const badStiffness = recentLogs.filter(
    (l) => l.stiffness_duration === 'over_2_hours' || l.stiffness_duration === '1_2_hours'
  ).length;
  if (badStiffness >= 2) signals.push('stiffness_worsening');

  // 4. Missed medication 2+ of last 3 days
  const missedMeds = recentLogs.filter((l) => l.medications_taken === 'no').length;
  if (missedMeds >= 2) signals.push('missed_medication');

  // 5. Mood declining significantly
  const recentMood = avg(recentLogs.map((l) => moodToScore(l.mood)));
  if (earlierLogs.length >= 2) {
    const earlierMood = avg(earlierLogs.map((l) => moodToScore(l.mood)));
    if (earlierMood - recentMood >= 1.2 && recentMood <= 2.5) signals.push('mood_declining');
  }

  // ── Diet signals ─────────────────────────────────────────────────────────────

  // 10. Poor diet quality on 2+ of last 3 days
  const poorDietDays = recentLogs.filter(
    (l) => l.diet_quality === 'poor' || l.diet_quality === 'mixed'
  ).length;
  if (poorDietDays >= 2) signals.push('inflammatory_diet');

  // 11. Alcohol on 2+ of last 3 days (known AS flare trigger)
  const alcoholDays = recentLogs.filter(
    (l) => (l.diet_triggers ?? []).includes('alcohol' as DietTrigger)
  ).length;
  if (alcoholDays >= 2) signals.push('recent_alcohol');

  // 12. High starch on 2+ of last 3 days (Ebringer hypothesis — starch feeds Klebsiella)
  const starchDays = recentLogs.filter(
    (l) => (l.diet_triggers ?? []).includes('high_starch' as DietTrigger)
  ).length;
  if (starchDays >= 2) signals.push('high_starch_intake');

  // ── HealthKit signals (best-effort, only fire when we have enough data) ──────

  if (healthHistory && healthHistory.length >= 3) {
    const sortedHealth = [...healthHistory].sort((a, b) => a.date.localeCompare(b.date));
    const recentHealth = sortedHealth.slice(-3);
    const earlierHealth = sortedHealth.slice(-6, -3);

    // 6. HRV dropping — a 15%+ drop from baseline is a strong inflammation signal
    const recentHRVs = recentHealth.map((d) => d.hrv).filter((v): v is number => v !== null);
    const earlierHRVs = earlierHealth.map((d) => d.hrv).filter((v): v is number => v !== null);
    if (recentHRVs.length >= 2 && earlierHRVs.length >= 2) {
      const recentHRV = avg(recentHRVs);
      const earlierHRV = avg(earlierHRVs);
      if (earlierHRV > 0 && (earlierHRV - recentHRV) / earlierHRV >= 0.15) {
        signals.push('hrv_dropping');
      }
    }

    // 7. Poor sleep: < 5.5h on 2+ recent days
    const poorSleepDays = recentHealth.filter(
      (d) => d.sleep_duration !== null && d.sleep_duration < 5.5
    ).length;
    if (poorSleepDays >= 2) signals.push('poor_sleep');

    // 8. Elevated resting heart rate (+5 bpm vs earlier baseline)
    const recentHRs = recentHealth.map((d) => d.resting_heart_rate).filter((v): v is number => v !== null);
    const earlierHRs = earlierHealth.map((d) => d.resting_heart_rate).filter((v): v is number => v !== null);
    if (recentHRs.length >= 2 && earlierHRs.length >= 2) {
      const recentHR = avg(recentHRs);
      const earlierHR = avg(earlierHRs);
      if (recentHR - earlierHR >= 5) signals.push('hr_elevated');
    }

    // 9. Low activity: steps < 3,000 on 2+ recent days (suggests body limiting itself)
    const lowStepDays = recentHealth.filter(
      (d) => d.steps !== null && d.steps < 3000
    ).length;
    if (lowStepDays >= 2) signals.push('low_activity');
  }

  if (signals.length >= 3) return { level: 'warning', signals };
  if (signals.length >= 2) return { level: 'watch', signals };
  return { level: 'none', signals };
}

export function useFlareRisk(
  logs: DailyLog[],
  activeFlare: Flare | null,
  healthHistory?: HealthData[]
): FlareRisk {
  return useMemo(
    () => computeFlareRisk(logs, activeFlare, healthHistory),
    [logs, activeFlare, healthHistory]
  );
}
