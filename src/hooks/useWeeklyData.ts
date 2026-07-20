import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDailyLogs, getActiveFlares, getActiveUveitisEpisode } from '@/services/database';

import { DailyLog, Flare, Mood, UveitisEpisode, UserProfile } from '@/types';
import { useProfile } from '@/contexts/ProfileContext';

export interface ScoreBreakdown {
  base: number;
  painPoints: number;
  fatiguePoints: number;
  flarePenalty: number;
  consistencyBonus: number;
  moodPoints: number;
  medPoints: number;
  logCount: number;
}

function moodToPoints(mood: Mood | null): number {
  switch (mood) {
    case 'great': return 15;
    case 'good': return 10;
    case 'okay': return 0;
    case 'low': return -5;
    case 'very_low': return -15;
    default: return 0;
  }
}

function medicationToPoints(taken: 'yes' | 'no' | 'partial' | undefined): number {
  switch (taken) {
    case 'yes': return 15;
    case 'partial': return 7.5;
    default: return 0;
  }
}

// Pain 0–3: small bonus (low pain is good). Pain 4–10: increasing penalty.
function painContribution(avgPain: number): number {
  if (avgPain <= 3) return Math.round((3 - avgPain) * 3);
  return Math.round(-((avgPain - 3) / 7) * 45);
}

// Fatigue 0–3: small bonus. Fatigue 4–10: increasing penalty.
function fatigueContribution(avgFatigue: number): number {
  if (avgFatigue <= 3) return Math.round((3 - avgFatigue) * 2);
  return Math.round(-((avgFatigue - 3) / 7) * 30);
}

function flarePenaltyForType(flare: Flare): number {
  const severityPenalty = flare.severity === 'severe' ? 45 : flare.severity === 'moderate' ? 32 : 20;
  const typeMultiplier = flare.flare_type === 'as' ? 1.0 : flare.flare_type === 'enthesitis' ? 0.7 : 0.6;
  return Math.round(severityPenalty * typeMultiplier);
}

function activeFlaresPenalty(flares: Flare[], uveitisEpisode: UveitisEpisode | null, profile: UserProfile | null): number {
  let penalty = 0;

  for (const flare of flares) {
    penalty += flarePenaltyForType(flare);
  }

  if (uveitisEpisode) {
    switch (uveitisEpisode.severity) {
      case 'severe': penalty += 30; break;
      case 'moderate': penalty += 20; break;
      default: penalty += 12;
    }
  }

  // Passive penalty for conditions without dedicated flare tracking
  if (profile?.conditions.includes('ibd')) penalty += 8;
  if (profile?.conditions.includes('psoriasis')) penalty += 5;

  return penalty;
}

function scoreUpperCap(flares: Flare[], uveitisEpisode: UveitisEpisode | null): number {
  const activeCount = flares.length + (uveitisEpisode ? 1 : 0);
  if (activeCount === 0) return 100;

  const hasAS = flares.some(f => f.flare_type === 'as');
  const hasSevere = flares.some(f => f.severity === 'severe') || uveitisEpisode?.severity === 'severe';

  if (activeCount >= 2) return hasSevere ? 38 : 45;
  if (hasSevere) return hasAS ? 50 : 58;

  const worst = [...flares].sort((a, b) => {
    const order = { severe: 0, moderate: 1, mild: 2 };
    return order[a.severity] - order[b.severity];
  })[0];

  if (worst?.severity === 'moderate') return hasAS ? 62 : 68;
  return 78;
}

function computeScore(
  logs: DailyLog[],
  activeFlares: Flare[],
  uveitisEpisode: UveitisEpisode | null,
  profile: UserProfile | null,
  tracksMedication: boolean,
): { score: number | null; breakdown: ScoreBreakdown | null } {
  if (logs.length === 0) return { score: null, breakdown: null };

  const count = logs.length;
  const avgPain = logs.reduce((sum, l) => sum + l.pain_score, 0) / count;
  const avgFatigue = logs.reduce((sum, l) => sum + l.fatigue_score, 0) / count;
  const avgMoodRaw = logs.reduce((sum, l) => sum + moodToPoints(l.mood), 0) / count;
  const avgMedRaw = tracksMedication
    ? logs.reduce((sum, l) => sum + medicationToPoints(l.medications_taken), 0) / count
    : 0;

  const base = 75;
  const painPts = painContribution(avgPain);
  const fatiguePts = fatigueContribution(avgFatigue);
  const flarePen = activeFlaresPenalty(activeFlares, uveitisEpisode, profile);
  const consistencyBonus = Math.round((count / 7) * 8);
  const moodPts = Math.round(avgMoodRaw * 0.5);
  const medPts = Math.round(avgMedRaw * 0.5);
  const cap = scoreUpperCap(activeFlares, uveitisEpisode);

  const score = Math.round(
    Math.min(cap, Math.max(0, base + painPts + fatiguePts - flarePen + consistencyBonus + moodPts + medPts))
  );

  const breakdown: ScoreBreakdown = {
    base,
    painPoints: painPts,
    fatiguePoints: fatiguePts,
    flarePenalty: flarePen,
    consistencyBonus,
    moodPoints: moodPts,
    medPoints: medPts,
    logCount: count,
  };

  return { score, breakdown };
}

export function useWeeklyData(tracksMedication = true): {
  logs: DailyLog[];
  isLoading: boolean;
  spondyScore: number | null;
  scoreBreakdown: ScoreBreakdown | null;
  refresh: () => Promise<void>;
} {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [spondyScore, setSpondyScore] = useState<number | null>(null);
  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [weekLogs, activeFlares, activeUveitis] = await Promise.all([
        getDailyLogs(user.id, 7),
        getActiveFlares(user.id),
        getActiveUveitisEpisode(user.id),
      ]);
      setLogs(weekLogs);
      const { score, breakdown } = computeScore(weekLogs, activeFlares, activeUveitis, profile, tracksMedication);
      setSpondyScore(score);
      setScoreBreakdown(breakdown);
    } catch (err) {
      console.error('useWeeklyData load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    load();
  }, [load]);

  return { logs, isLoading, spondyScore, scoreBreakdown, refresh: load };
}
