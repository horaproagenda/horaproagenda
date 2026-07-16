import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, UserPlus } from 'lucide-react';

interface SignupRow {
  id: string;
  created_at: string;
  email_sent: boolean;
}

/**
 * Painel Super Admin — Novos Cadastros.
 * Mostra apenas data/hora de cada novo cadastro, SEM nome, e-mail
 * ou qualquer vínculo com o profissional. Serve apenas para
 * a administradora saber que precisa comprar uma nova instância
 * de WhatsApp e ser notificada dos novos usuários.
 */
export function NewSignupsPanel() {
  const [rows, setRows] = useState<SignupRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('signup_notifications' as any)
        .select('id, created_at, email_sent')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!cancelled) {
        setRows((data as any as SignupRow[]) || []);
        setLoading(false);
      }
    })();

    const channel = supabase
      .channel('signup-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'signup_notifications' },
        (payload) => {
          setRows((prev) => [payload.new as SignupRow, ...prev].slice(0, 100));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Novos cadastros</h3>
        <Badge variant="secondary" className="text-[10px]">
          {rows.length}
        </Badge>
        <span className="ml-auto text-[11px] text-muted-foreground">
          Somente data/hora — sem dados pessoais
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          Nenhum cadastro novo registrado ainda.
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto divide-y">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2 text-xs">
              <span>{fmt(r.created_at)}</span>
              <Badge variant={r.email_sent ? 'default' : 'outline'} className="text-[10px]">
                {r.email_sent ? 'Notificação enviada' : 'Notificação disparada'}
              </Badge>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground border-t pt-2">
        Uma notificação é enviada automaticamente para <strong>horaproagenda@gmail.com</strong> a
        cada novo cadastro, sem incluir nome, e-mail ou qualquer identificação do profissional.
      </p>
    </Card>
  );
}
