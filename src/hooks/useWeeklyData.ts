import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDailyLogs, getActiveFlare } from '@/services/database';
import { DailyLog, Flare, Mood } from '@/types';

function moodScore(mood: Mood | null): number {
  switch (mood) {
    case 'great': return 5;
    case 'good': return 4;
    case 'okay': return 3;
    case 'low': return 2;
    case 'very_low': return 1;
    default: return 0;
  }
}

function moodToPoints(mood: Mood | null): number {
  switch (mood) {
    case 'great': return 15;
    case 'good': return 10;
    case 'okay': return 5;
    case 'low': return 0;
    case 'very_low': return -10;
    default: return 0;
  }
}

function medicationToPoints(taken: 'yes' | 'no' | 'partial' | undefined): number {
  switch (taken) {
    case 'yes': return 15;
    case 'partial': return 7.5;
    case 'no': return 0;
    default: return 0;
  }
}

function flarePenalty(flare: Flare | null): number {
  if (!flare) return 0;
  switch (flare.severity) {
    case 'severe': return 35;
    case 'moderate': return 25;
    case 'mild': return 15;
    default: return 15;
  }
}

function computeSpondyScore(logs: DailyLog[], activeFlare: Flare | null): number | null {
  if (logs.length === 0) return null;

  const count = logs.length;

  const avgPain = logs.reduce((sum, l) => sum + l.pain_score, 0) / count;
  const avgFatigue = logs.reduce((sum, l) => sum + l.fatigue_score, 0) / count;
  const avgMoodPoints = logs.reduce((sum, l) => sum + moodToPoints(l.mood), 0) / count;
  const avgMedPoints = logs.reduce((sum, l) => sum + medicationToPoints(l.medications_taken), 0) / count;

  const consistencyBonus = (count / 7) * 20;

  // Pain penalty: 0-10 maps to 0 to -30
  const painPenalty = (avgPain / 10) * 30;
  // Fatigue penalty: 0-10 maps to 0 to -20
  const fatiguePenalty = (avgFatigue / 10) * 20;
  // Active flare always drags the score down regardless of logged symptoms
  const activeFlarePenalty = flarePenalty(activeFlare);

  const base = 75;
  const score =
    base - painPenalty - fatiguePenalty - activeFlarePenalty +
    consistencyBonus + avgMoodPoints + avgMedPoints;

  return Math.round(Math.min(100, Math.max(0, score)));
}

export function useWeeklyData(): {
  logs: DailyLog[];
  isLoading: boolean;
  spondyScore: number | null;
} {
  const { user } = useAuth();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [spondyScore, setSpondyScore] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [weekLogs, activeFlare] = await Promise.all([
        getDailyLogs(user.id, 7),
        getActiveFlare(user.id),
      ]);
      setLogs(weekLogs);
      setSpondyScore(computeSpondyScore(weekLogs, activeFlare));
    } catch (err) {
      console.error('useWeeklyData load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return { logs, isLoading, spondyScore };
}
