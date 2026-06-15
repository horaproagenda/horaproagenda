import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

let cached: string | null | undefined = undefined;
const listeners = new Set<(v: string | null) => void>();

async function loadAccountOwnerId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("account_owner_id")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !data?.account_owner_id) return null;
  return data.account_owner_id as string;
}

/**
 * Returns the caller's tenant id (account_owner_id) for use as a suffix
 * on shared Realtime channel names. Returns null until resolved / when
 * unauthenticated. Cached in-memory across hook instances.
 */
export function useAccountOwnerId(): string | null {
  const [value, setValue] = useState<string | null>(cached ?? null);

  useEffect(() => {
    let active = true;
    if (cached !== undefined) {
      setValue(cached);
    } else {
      loadAccountOwnerId().then((v) => {
        cached = v;
        if (active) setValue(v);
        listeners.forEach((l) => l(v));
      });
    }
    const listener = (v: string | null) => {
      if (active) setValue(v);
    };
    listeners.add(listener);

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      cached = undefined;
      loadAccountOwnerId().then((v) => {
        cached = v;
        listeners.forEach((l) => l(v));
      });
    });

    return () => {
      active = false;
      listeners.delete(listener);
      sub.subscription.unsubscribe();
    };
  }, []);

  return value;
}
