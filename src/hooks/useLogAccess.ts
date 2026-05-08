import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LogAccessParams {
  module: string;
  action: 'view' | 'edit' | 'export' | 'open' | 'delete' | 'create';
  targetType?: string | null;
  targetId?: string | null;
  fieldsViewed?: string[];
  fieldsChanged?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget access logger. Calls the SECURITY DEFINER `log_access` RPC.
 * Errors are swallowed so logging never blocks the UI.
 */
export async function logAccess(params: LogAccessParams): Promise<void> {
  try {
    await supabase.rpc('log_access', {
      p_module: params.module,
      p_action: params.action,
      p_target_type: params.targetType ?? null,
      p_target_id: params.targetId ?? null,
      p_fields_viewed: params.fieldsViewed ?? [],
      p_fields_changed: params.fieldsChanged ?? [],
      p_metadata: (params.metadata ?? {}) as never,
    });
  } catch {
    // ignore – logging should never break the UI
  }
}

/**
 * Log an access event once per mount (deduped by `key`).
 */
export function useLogAccessOnMount(params: LogAccessParams & { key?: string; enabled?: boolean }) {
  const fired = useRef(false);
  useEffect(() => {
    if (params.enabled === false) return;
    if (fired.current) return;
    fired.current = true;
    void logAccess(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.key, params.enabled]);
}
