import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
export function useCasosRealtime(owner: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel(`casos-${crypto.randomUUID()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'casos', filter: `owner_id=eq.${owner}` }, () => { void qc.invalidateQueries({ queryKey: ['casos'] }); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [owner, qc]);
}