import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase';
import { BiologicInjection } from '@/types';

export const BIOLOGIC_INTERVALS: Record<string, number> = {
  adalimumab: 14,
  secukinumab: 28,
  ixekizumab: 28,
  ustekinumab: 84,
};

export function useBiologicInjections() {
  const { user } = useAuth();
  const [injections, setInjections] = useState<BiologicInjection[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('biologic_injections')
        .select('*')
        .eq('user_id', user.id)
        .order('injected_at', { ascending: false })
        .limit(20);
      if (!error) setInjections((data ?? []) as BiologicInjection[]);
    } catch {}
    finally { setIsLoading(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const logInjection = useCallback(async (inj: Omit<BiologicInjection, 'id' | 'user_id'>) => {
    if (!user) return;
    const { error } = await supabase
      .from('biologic_injections')
      .insert({ ...inj, user_id: user.id });
    if (error) throw error;
    await load();
  }, [user, load]);

  const updateResponseRating = useCallback(async (id: string, rating: number) => {
    const { error } = await supabase
      .from('biologic_injections')
      .update({ response_rating: rating })
      .eq('id', id);
    if (error) throw error;
    await load();
  }, [load]);

  const deleteInjection = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('biologic_injections')
      .delete()
      .eq('id', id);
    if (error) throw error;
    await load();
  }, [load]);

  // Compute next due date for a given medication
  const getNextDueDate = useCallback((medicationName: string): { daysUntil: number; dueDate: string } | null => {
    const lastInj = injections.find(i => i.medication_name.toLowerCase().includes(medicationName.toLowerCase()));
    if (!lastInj) return null;
    const due = new Date(lastInj.injected_at + 'T12:00:00');
    due.setDate(due.getDate() + lastInj.interval_days);
    const daysUntil = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return { daysUntil, dueDate: due.toISOString().split('T')[0] };
  }, [injections]);

  return { injections, isLoading, logInjection, updateResponseRating, deleteInjection, getNextDueDate, refresh: load };
}
