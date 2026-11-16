import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useLiveRefresh() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const rawApiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '' : 'http://localhost:5000');
    const apiUrl = rawApiUrl ? rawApiUrl.replace(/\/+$/, '') : '';
    const streamUrl = apiUrl ? `${apiUrl}/api/events/stream` : '/api/events/stream';

    let es = null;
    try {
      es = new EventSource(streamUrl, { withCredentials: true });

      es.onmessage = (e) => {
        if (e.data === 'positions') queryClient.invalidateQueries({ queryKey: ['positions'] });
        if (e.data === 'weeklyAllocations') queryClient.invalidateQueries({ queryKey: ['weeklyAllocations'] });
      };

      es.onerror = () => {
        // EventSource auto-reconnects on its own
      };
    } catch (_) {}

    return () => {
      if (es) es.close();
    };
  }, [queryClient]);
}