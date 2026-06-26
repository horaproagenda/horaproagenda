import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { CheckCircle2, RefreshCw, MessageSquare } from 'lucide-react';

interface ProfRow {
  id: string;
  name: string | null;
  email: string | null;
  account_owner_id: string | null;
  whatsapp_release_approved: boolean | null;
  created_at: string;
}

function fmt(iso?: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR'); } catch { return '—'; }
}

export function WhatsappReleasePanel() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['super-admin-whatsapp-releases'],
    queryFn: async (): Promise<ProfRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('professionals')
        .select('id,name,email,account_owner_id,whatsapp_release_approved,created_at')
        .eq('whatsapp_release_approved', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProfRow[];
    },
    staleTime: 10_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel('super-admin-whatsapp-release-rt')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes', { event: '*', schema: 'public', table: 'professionals' } as any,
        () => qc.invalidateQueries({ queryKey: ['super-admin-whatsapp-releases'] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const approve = async (row: ProfRow) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('professionals')
        .update({ whatsapp_release_approved: true })
        .eq('id', row.id);
      if (error) throw error;
      toast.success('WhatsApp liberado para o profissional');
      qc.invalidateQueries({ queryKey: ['super-admin-whatsapp-releases'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao aprovar');
    }
  };

  const rows = data ?? [];

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Liberações de WhatsApp pendentes</h2>
          {rows.length > 0 && <Badge variant="secondary">{rows.length}</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Atualizar
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Profissionais que acabaram de se cadastrar veem a tela "Validando seu cadastro" até que você compre/atribua uma instância no UltraMsg e clique em "Liberar QR Code".
      </p>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Profissional</TableHead>
              <TableHead className="text-[11px]">E-mail</TableHead>
              <TableHead className="text-[11px]">Cadastro</TableHead>
              <TableHead className="text-[11px] text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={4} className="text-xs py-6 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-xs py-6 text-center text-muted-foreground">Nenhuma liberação pendente</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs font-medium">{r.name ?? '—'}</TableCell>
                <TableCell className="text-xs">{r.email ?? '—'}</TableCell>
                <TableCell className="text-xs">{fmt(r.created_at)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" onClick={() => approve(r)} className="bg-green-600 hover:bg-green-700">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Liberar QR Code
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
