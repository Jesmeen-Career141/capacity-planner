import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useLiveRefresh() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const es = new EventSource(`${import.meta.env.VITE_API_URL}/api/events/stream`);

    es.onmessage = (e) => {
      if (e.data === 'positions') queryClient.invalidateQueries(['positions']);
      if (e.data === 'weeklyAllocations') queryClient.invalidateQueries(['weeklyAllocations']);
    };

    es.onerror = () => {
      // EventSource auto-reconnects on its own; nothing to do here
    };

    return () => es.close();
  }, [queryClient]);
}