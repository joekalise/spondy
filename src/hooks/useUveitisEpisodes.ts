import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase';
import { UveitisEpisode } from '@/types';

export function useUveitisEpisodes() {
  const { user } = useAuth();
  const [episodes, setEpisodes] = useState<UveitisEpisode[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('uveitis_episodes')
        .select('*')
        .eq('user_id', user.id)
        .order('start_date', { ascending: false });
      if (!error) setEpisodes((data ?? []) as UveitisEpisode[]);
    } catch {}
    finally { setIsLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const startEpisode = useCallback(async (ep: Omit<UveitisEpisode, 'id' | 'user_id' | 'end_date'>) => {
    if (!user) return;
    const { error } = await supabase
      .from('uveitis_episodes')
      .insert({ ...ep, user_id: user.id, end_date: null });
    if (error) throw error;
    await load();
  }, [user, load]);

  const endEpisode = useCallback(async (id: string) => {
    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase
      .from('uveitis_episodes')
      .update({ end_date: today })
      .eq('id', id);
    if (error) throw error;
    await load();
  }, [load]);

  const deleteEpisode = useCallback(async (id: string) => {
    const { error } = await supabase.from('uveitis_episodes').delete().eq('id', id);
    if (error) throw error;
    await load();
  }, [load]);

  const updateEpisode = useCallback(async (id: string, updates: Partial<UveitisEpisode>) => {
    const { error } = await supabase.from('uveitis_episodes').update(updates).eq('id', id);
    if (error) throw error;
    await load();
  }, [load]);

  const activeEpisode = episodes.find(e => e.end_date === null) ?? null;

  return { episodes, activeEpisode, isLoading, startEpisode, endEpisode, deleteEpisode, updateEpisode, refresh: load };
}
