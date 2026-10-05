import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Search, Trash2, NotebookPen, Loader2 } from 'lucide-react';
import { useConsultationNotes, type ConsultationNote } from '@/hooks/useConsultationNotes';
import { ConsultationSummarySheet } from './ConsultationSummarySheet';

interface Props {
  clientId: string;
  appointments?: { id: string; start_time: string; service?: { name?: string } | null }[];
}

export function ClientConsultationsTab({ clientId, appointments = [] }: Props) {
  const { notes, isLoading, remove } = useConsultationNotes(clientId);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<ConsultationNote | null>(null);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? notes.filter((n) => (n.summary + ' ' + n.raw_notes).toLowerCase().includes(t)) : notes;
  }, [notes, q]);

  const openNote = (n: ConsultationNote | null) => { setCurrent(n); setOpen(true); };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nas consultas" className="pl-8" />
        </div>
        <Button onClick={() => openNote(null)} className="gap-2"><Plus className="h-4 w-4" /> Nova consulta</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <NotebookPen className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{q ? 'Nenhuma consulta encontrada.' : 'Nenhuma consulta registrada ainda.'}</p>
        </CardContent></Card>
      ) : (
        <ul className="space-y-2">
          {filtered.map((n) => (
            <li key={n.id}>
              <Card className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => openNote(n)}>
                <CardContent className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">
                      {new Date(n.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground whitespace-pre-line">{n.summary}</p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Excluir consulta" className="h-8 w-8 shrink-0"
                    onClick={(e) => { e.stopPropagation(); if (confirm('Excluir esta consulta?')) remove.mutate(n.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConsultationSummarySheet open={open} onOpenChange={setOpen} clientId={clientId} note={current} appointments={appointments} />
    </div>
  );
}
