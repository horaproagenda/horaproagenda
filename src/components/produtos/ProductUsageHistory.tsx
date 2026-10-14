import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProductUsageRecords, type ProductUsageRecord } from '@/hooks/useProductUsageRecords';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SafeDateInput } from '@/components/ui/safe-date-input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Edit, History, Save } from 'lucide-react';
import { toast } from '@/lib/toast';

const states = { planned: 'Planejado', in_use: 'Em uso', completed: 'Concluído', cancelled: 'Cancelado' };
const dateLabel = (date: string | null) => date ? date.split('-').reverse().join('/') : '—';

export function ProductUsageHistory({ productId, canEdit }: { productId: string; canEdit: boolean }) {
  const { usageRecords, changeCycle } = useProductUsageRecords(productId);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<ProductUsageRecord | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<'correct' | 'reopen' | 'cancel'>('correct');
  const { data: events = [] } = useQuery({
    queryKey: ['product_usage_events', productId],
    queryFn: async () => {
      const { data, error } = await supabase.from('product_usage_events').select('id,usage_id,event_type,reason,created_at,stock_delta').eq('product_id', productId).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const records = usageRecords.filter(r => (status === 'all' || r.status === status) && `${dateLabel(r.start_date)} ${dateLabel(r.end_date)} ${r.container_amount} ${r.container_unit}`.includes(search));
  return <section className="space-y-3 border-t pt-4">
    <h4 className="font-medium flex items-center gap-2"><History className="h-4 w-4" />Registros de uso</h4>
    <div className="flex flex-col sm:flex-row gap-2">
      <Input aria-label="Buscar registro de uso" placeholder="Buscar registro" value={search} onChange={e => setSearch(e.target.value)} />
      <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as situações</SelectItem>{Object.entries(states).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select>
    </div>
    {records.length === 0 && <p className="text-sm text-muted-foreground">Nenhum registro encontrado.</p>}
    {records.map(record => <div key={record.id} className="border-b pb-3 space-y-2 text-sm">
      <div className="flex justify-between gap-2"><strong>{record.container_amount.toLocaleString('pt-BR')} {record.container_unit}</strong><span>{states[record.status]}</span></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-muted-foreground">
        <span>Início: {dateLabel(record.start_date)}</span><span>Término: {dateLabel(record.end_date)}</span>
        <span>Duração: {record.duration_days == null ? '—' : `${record.duration_days} dia(s)`}</span><span>Atendimentos: {record.appointments_counted}</span>
        <span>Média: {record.avg_quantity_per_appointment == null ? '—' : record.avg_quantity_per_appointment.toLocaleString('pt-BR')}</span><span>Estoque após baixa: {record.stock_after == null ? '—' : record.stock_after.toLocaleString('pt-BR')}</span>
      </div>
      {canEdit && record.status !== 'cancelled' && <Button size="sm" variant="outline" onClick={() => { setEditing(record); setStart(record.start_date); setEnd(record.end_date); setReason(''); setAction('correct'); }}><Edit className="h-4 w-4 mr-2" />Corrigir registro</Button>}
      <details className="text-muted-foreground"><summary className="cursor-pointer text-xs">Histórico de alterações</summary>{events.filter(e => e.usage_id === record.id).map(event => <p key={event.id} className="text-xs mt-1">{new Date(event.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — {({ usage_created: 'Registro criado', usage_started: 'Uso iniciado', usage_finished: 'Uso concluído', usage_corrected: 'Registro corrigido', usage_cancelled: 'Uso cancelado' } as Record<string,string>)[event.event_type] ?? 'Estoque ajustado'}{event.reason ? `: ${event.reason}` : ''}</p>)}</details>
    </div>)}
    <Dialog open={!!editing} onOpenChange={open => { if (!open && !changeCycle.isPending) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>Corrigir registro de uso</DialogTitle></DialogHeader>
      <Label>Alteração</Label><Select value={action} onValueChange={value => setAction(value as typeof action)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="correct">Corrigir datas</SelectItem>{editing?.status === 'completed' && <SelectItem value="reopen">Reabrir uso e estornar baixa</SelectItem>}<SelectItem value="cancel">Cancelar uso e estornar baixa</SelectItem></SelectContent></Select>
      {action !== 'cancel' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label>Início</Label><SafeDateInput value={start ?? ''} onCommit={setStart} /></div>{editing?.status === 'completed' && action !== 'reopen' && <div><Label>Término</Label><SafeDateInput value={end ?? ''} onCommit={setEnd} /></div>}</div>}
      <Label htmlFor="usage-correction-reason">Motivo</Label><Textarea id="usage-correction-reason" value={reason} onChange={e => setReason(e.target.value)} />
      <Button disabled={changeCycle.isPending || !reason.trim()} onClick={async () => {
        if (!editing) return;
        try { await changeCycle.mutateAsync({ usageId: editing.id, version: editing.version, startDate: start, endDate: action === 'reopen' || action === 'cancel' ? null : end, reason, action }); toast.success('Registro atualizado e alteração registrada no histórico.'); setEditing(null); } catch { /* Retém os dados; erro humanizado pelo hook. */ }
      }}><Save className="h-4 w-4 mr-2" />{changeCycle.isPending ? 'Salvando...' : 'Confirmar alteração'}</Button>
    </DialogContent></Dialog>
  </section>;
}