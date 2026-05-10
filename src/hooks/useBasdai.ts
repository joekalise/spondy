import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase';
import { BasdaiScore } from '@/types';

export function useBasdai() {
  const { user } = useAuth();
  const [scores, setScores] = useState<BasdaiScore[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('basdai_scores')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(12);
      if (!error) setScores((data ?? []) as BasdaiScore[]);
    } catch {}
    finally { setIsLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const saveScore = useCallback(async (answers: { q1: number; q2: number; q3: number; q4: number; q5: number; q6: number }) => {
    if (!user) return;
    const score = parseFloat(((answers.q1 + answers.q2 + answers.q3 + answers.q4 + (answers.q5 + answers.q6) / 2) / 5).toFixed(2));
    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase
      .from('basdai_scores')
      .upsert({ user_id: user.id, date: today, ...answers, score }, { onConflict: 'user_id,date' });
    if (error) throw error;
    await load();
  }, [user, load]);

  const latestScore = scores[0] ?? null;
  const daysSinceLastScore = latestScore
    ? Math.floor((Date.now() - new Date(latestScore.date).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return { scores, latestScore, daysSinceLastScore, isLoading, saveScore, refresh: load };
}
