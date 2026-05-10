import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getFlares,
  startFlare as dbStartFlare,
  endFlare as dbEndFlare,
  updateFlare as dbUpdateFlare,
  deleteFlare as dbDeleteFlare,
} from '@/services/database';
import { Flare, FlareSeverity, FlareType } from '@/types';

function matchesType(flare: Flare, flareType: FlareType): boolean {
  return flare.flare_type === flareType || (!flare.flare_type && flareType === 'as');
}

export function useFlares(flareType: FlareType = 'as'): {
  flares: Flare[];
  activeFlare: Flare | null;
  isLoading: boolean;
  error: string | null;
  startFlare: (severity: FlareSeverity, areas: string[], notes: string) => Promise<void>;
  endCurrentFlare: () => Promise<void>;
  updateFlare: (id: string, updates: Partial<Flare>) => Promise<void>;
  deleteFlare: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
} {
  const { user } = useAuth();
  const [flares, setFlares] = useState<Flare[]>([]);
  const [activeFlare, setActiveFlare] = useState<Flare | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const allFlares = await getFlares(user.id);
      const typed = allFlares.filter(f => matchesType(f, flareType));
      setFlares(typed);
      setActiveFlare(typed.find(f => !f.end_date) ?? null);
    } catch (err) {
      console.error('useFlares load error:', err);
      setError('Failed to load flare history.');
    } finally {
      setIsLoading(false);
    }
  }, [user, flareType]);

  useEffect(() => {
    load();
  }, [load]);

  const startFlare = useCallback(
    async (severity: FlareSeverity, areas: string[], notes: string) => {
      if (!user) throw new Error('No authenticated user');

      const today = new Date().toISOString().split('T')[0];
      const newFlare = await dbStartFlare({
        user_id: user.id,
        start_date: today,
        severity,
        areas_affected: areas,
        notes,
        flare_type: flareType,
      });

      setActiveFlare(newFlare);
      setFlares((prev) => [newFlare, ...prev]);
    },
    [user, flareType]
  );

  const endCurrentFlare = useCallback(async () => {
    if (!activeFlare?.id) throw new Error('No active flare');

    const today = new Date().toISOString().split('T')[0];
    const ended = await dbEndFlare(activeFlare.id, today);

    setActiveFlare(null);
    setFlares((prev) =>
      prev.map((f) => (f.id === ended.id ? ended : f))
    );
  }, [activeFlare]);

  const updateFlare = useCallback(async (id: string, updates: Partial<Flare>) => {
    const updated = await dbUpdateFlare(id, updates);
    setFlares(prev => prev.map(f => f.id === id ? updated : f));
    if (activeFlare?.id === id) setActiveFlare(updated.end_date ? null : updated);
  }, [activeFlare]);

  const deleteFlare = useCallback(async (id: string) => {
    await dbDeleteFlare(id);
    setFlares(prev => prev.filter(f => f.id !== id));
    if (activeFlare?.id === id) setActiveFlare(null);
  }, [activeFlare]);

  return {
    flares,
    activeFlare,
    isLoading,
    error,
    startFlare,
    endCurrentFlare,
    updateFlare,
    deleteFlare,
    refresh: load,
  };
}
