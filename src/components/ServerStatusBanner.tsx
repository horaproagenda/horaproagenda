import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { isServerDown, setServerDown, subscribeServerStatus } from '@/lib/serverStatus';

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

async function ping(): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: KEY }, signal: ctrl.signal });
    return r.ok;
  } catch { return false; } finally { clearTimeout(t); }
}

export function ServerStatusBanner() {
  const [down, setDown] = useState(isServerDown());
  useEffect(() => subscribeServerStatus(setDown), []);
  useEffect(() => {
    if (!down) return;
    const id = setInterval(async () => {
      if (await ping()) window.location.reload();
    }, 20000);
    return () => clearInterval(id);
  }, [down]);
  if (!down) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[100] pt-safe bg-destructive text-destructive-foreground">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2 text-sm">
        <span>Servidor temporariamente indisponível. Mostrando as informações guardadas; tentando novamente…</span>
        <Button size="sm" variant="secondary" onClick={async () => { if (await ping()) { setServerDown(false); window.location.reload(); } }}>
          Tentar de novo
        </Button>
      </div>
    </div>
  );
}
