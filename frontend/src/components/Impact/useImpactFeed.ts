import { useEffect, useState } from 'react';
import type { ImpactResponse } from '@/types/impact';
import { apiUrl } from '@/utils/api';

export function useImpactFeed<T extends 'neos' | 'fireballs'>(feed: T, days: number, retry: number) {
  const [payload, setPayload] = useState<ImpactResponse<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setPayload(null);
    setError(null);
    async function load() {
      try {
        const response = await fetch(apiUrl(`/impact/${feed}?days=${days}`), { signal: controller.signal });
        if (!response.ok) throw new Error('Request failed');
        const result = await response.json() as ImpactResponse<T>;
        if (controller.signal.aborted) return;
        setPayload(result);
        setError(result.error?.message ?? (result.source === 'unavailable' ? 'Source unavailable.' : null));
      } catch {
        if (controller.signal.aborted) return;
        setError('Data is temporarily unavailable.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [feed, days, retry]);

  return { payload, loading, error };
}
