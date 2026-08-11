import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDailyLogs, getRecentFlares, getRecentUveitisEpisodes } from '@/services/database';

import { DailyLog, Flare, Mood, UveitisEpisode, UserProfile } from '@/types';
import { useProfile } from '@/contexts/ProfileContext';

// How many days after a flare/episode ends its score penalty and cap keep
// relaxing, instead of vanishing the instant it's marked resolved.
const FLARE_TAPER_DAYS = 10;

// 1.0 while still active, tapering linearly to 0 by FLARE_TAPER_DAYS after end_date.
function flareRecencyWeight(endDate: string | null): number {
  if (!endDate) return 1;
  const daysSinceEnd = Math.floor((Date.now() - new Date(endDate).getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceEnd <= 0) return 1;
  if (daysSinceEnd >= FLARE_TAPER_DAYS) return 0;
  return 1 - daysSinceEnd / FLARE_TAPER_DAYS;
}

export interface ScoreBreakdown {
  base: number;
  painPoints: number;
  fatiguePoints: number;
  activeFlarePenalty: number;
  recentFlarePenalty: number;
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
  return Math.round(severityPenalty * typeMultiplier * flareRecencyWeight(flare.end_date));
}

// Splits the flare penalty into "active" (still ongoing, end_date null) and
// "recent" (ended but still within the taper window) so the score breakdown
// can show them as distinct factors instead of one merged line.
function flarePenalties(
  flares: Flare[],
  uveitisEpisodes: UveitisEpisode[],
  profile: UserProfile | null
): { active: number; recent: number } {
  let active = 0;
  let recent = 0;

  for (const flare of flares) {
    const penalty = flarePenaltyForType(flare);
    if (flare.end_date === null) active += penalty;
    else recent += penalty;
  }

  for (const episode of uveitisEpisodes) {
    const basePenalty = episode.severity === 'severe' ? 30 : episode.severity === 'moderate' ? 20 : 12;
    const penalty = Math.round(basePenalty * flareRecencyWeight(episode.end_date));
    if (episode.end_date === null) active += penalty;
    else recent += penalty;
  }

  // Passive penalty for conditions without dedicated flare tracking — ongoing, not tapering
  if (profile?.conditions.includes('ibd')) active += 8;
  if (profile?.conditions.includes('psoriasis')) active += 5;

  return { active, recent };
}

// Caps the score while a flare is active or recently ended, blending back to
// 100 as its recency weight tapers to 0 rather than releasing all at once.
function scoreUpperCap(flares: Flare[], uveitisEpisodes: UveitisEpisode[]): number {
  const weightedFlares = flares
    .map((f) => ({ flare: f, weight: flareRecencyWeight(f.end_date) }))
    .filter((x) => x.weight > 0);
  const weightedUveitis = uveitisEpisodes
    .map((u) => ({ episode: u, weight: flareRecencyWeight(u.end_date) }))
    .filter((x) => x.weight > 0);

  const activeCount = weightedFlares.length + weightedUveitis.length;
  if (activeCount === 0) return 100;

  const hasAS = weightedFlares.some((x) => x.flare.flare_type === 'as');
  const hasSevere =
    weightedFlares.some((x) => x.flare.severity === 'severe') ||
    weightedUveitis.some((x) => x.episode.severity === 'severe');

  let rawCap: number;
  if (activeCount >= 2) {
    rawCap = hasSevere ? 38 : 45;
  } else if (hasSevere) {
    rawCap = hasAS ? 50 : 58;
  } else {
    const worst = [...weightedFlares.map((x) => x.flare)].sort((a, b) => {
      const order = { severe: 0, moderate: 1, mild: 2 };
      return order[a.severity] - order[b.severity];
    })[0];
    rawCap = worst?.severity === 'moderate' ? (hasAS ? 62 : 68) : 78;
  }

  const maxWeight = Math.max(0, ...weightedFlares.map((x) => x.weight), ...weightedUveitis.map((x) => x.weight));
  return Math.round(100 - (100 - rawCap) * maxWeight);
}

function computeScore(
  logs: DailyLog[],
  recentFlares: Flare[],
  recentUveitisEpisodes: UveitisEpisode[],
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
  const { active: activeFlarePen, recent: recentFlarePen } = flarePenalties(recentFlares, recentUveitisEpisodes, profile);
  const consistencyBonus = Math.round((count / 7) * 8);
  const moodPts = Math.round(avgMoodRaw * 0.5);
  const medPts = Math.round(avgMedRaw * 0.5);
  const cap = scoreUpperCap(recentFlares, recentUveitisEpisodes);

  const score = Math.round(
    Math.min(
      cap,
      Math.max(0, base + painPts + fatiguePts - activeFlarePen - recentFlarePen + consistencyBonus + moodPts + medPts)
    )
  );

  const breakdown: ScoreBreakdown = {
    base,
    painPoints: painPts,
    fatiguePoints: fatiguePts,
    activeFlarePenalty: activeFlarePen,
    recentFlarePenalty: recentFlarePen,
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
      const taperSince = new Date(Date.now() - FLARE_TAPER_DAYS * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const [weekLogs, recentFlares, recentUveitis] = await Promise.all([
        getDailyLogs(user.id, 7),
        getRecentFlares(user.id, taperSince),
        getRecentUveitisEpisodes(user.id, taperSince),
      ]);
      setLogs(weekLogs);
      const { score, breakdown } = computeScore(weekLogs, recentFlares, recentUveitis, profile, tracksMedication);
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
