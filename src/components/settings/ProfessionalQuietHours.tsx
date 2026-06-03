import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Clock, Save } from 'lucide-react';
import { useProfessionals } from '@/hooks/useProfessionals';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type Row = { id: string; name: string; quiet_hours_start: number | null; quiet_hours_end: number | null };

/**
 * Per-professional WhatsApp quiet hours. Overrides each template's window
 * for that professional's automated messages.
 */
export function ProfessionalQuietHours() {
  const { professionals } = useProfessionals();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('professionals')
        .select('id, name, quiet_hours_start, quiet_hours_end')
        .order('name');
      if (!cancelled && data) setRows(data as Row[]);
    })();
    return () => { cancelled = true; };
  }, [professionals.length]);

  const update = (id: string, patch: Partial<Row>) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const save = async (row: Row) => {
    setSavingId(row.id);
    const start = row.quiet_hours_start;
    const end = row.quiet_hours_end;
    if ((start != null && end == null) || (start == null && end != null)) {
      toast.error('Preencha início e fim, ou deixe ambos vazios.');
      setSavingId(null);
      return;
    }
    if (start != null && end != null && (start < 0 || start > 23 || end < 0 || end > 23)) {
      toast.error('Use horas entre 0 e 23.');
      setSavingId(null);
      return;
    }
    const { error } = await supabase
      .from('professionals')
      .update({ quiet_hours_start: start, quiet_hours_end: end })
      .eq('id', row.id);
    setSavingId(null);
    if (error) return toast.error('Erro ao salvar: ' + error.message);
    toast.success('Janela de envio salva.');
    queryClient.invalidateQueries({ queryKey: ['professionals'] });
  };

  return (
    <Card className="card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2"><Clock className="h-4 w-4 text-primary" /></div>
          <div>
            <CardTitle className="text-sm font-medium">Janelas de envio por profissional</CardTitle>
            <CardDescription className="text-xs">
              Define o horário permitido para mensagens automáticas (lembretes, confirmações, pós-atendimento e
              aniversário) de cada profissional. Quando preenchido, sobrepõe a janela do template. Mensagens fora
              da janela são enfileiradas e enviadas assim que a janela abrir.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-xs text-muted-foreground">Nenhum profissional cadastrado.</p>}
          {rows.map(row => (
            <div key={row.id} className="grid grid-cols-12 items-end gap-2 rounded-md border border-border/60 p-2">
              <div className="col-span-12 sm:col-span-5">
                <Label className="text-[11px] uppercase text-muted-foreground">Profissional</Label>
                <div className="text-xs font-medium truncate">{row.name}</div>
              </div>
              <div className="col-span-5 sm:col-span-3">
                <Label className="text-[11px] uppercase text-muted-foreground">Início (0–23)</Label>
                <Input
                  type="number" min={0} max={23}
                  value={row.quiet_hours_start ?? ''}
                  onChange={e => update(row.id, { quiet_hours_start: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="—"
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-5 sm:col-span-3">
                <Label className="text-[11px] uppercase text-muted-foreground">Fim (exclusivo)</Label>
                <Input
                  type="number" min={0} max={23}
                  value={row.quiet_hours_end ?? ''}
                  onChange={e => update(row.id, { quiet_hours_end: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="—"
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Button size="sm" variant="outline" onClick={() => save(row)} disabled={savingId === row.id} className="h-8 w-full px-2">
                  <Save className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default ProfessionalQuietHours;
