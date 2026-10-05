import { useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, Save, RotateCcw, Square } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useCurrentProfessional } from '@/hooks/useCurrentProfessional';
import { useConsultationNotes, streamConsultationSummary, type ConsultationNote } from '@/hooks/useConsultationNotes';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: string;
  /** Consulta existente para editar. */
  note?: ConsultationNote | null;
  /** Agendamento já ligado (atalho dos detalhes do agendamento). */
  appointmentId?: string | null;
  appointments?: { id: string; start_time: string; service?: { name?: string } | null }[];
}

const NONE = '__none__';

export function ConsultationSummarySheet({ open, onOpenChange, clientId, note, appointmentId, appointments = [] }: Props) {
  const draftKey = `consultation-draft-${clientId}-${note?.id ?? 'new'}`;
  const { save } = useConsultationNotes(clientId);
  const { professionalId } = useCurrentProfessional();
  const [raw, setRaw] = useState('');
  const [summary, setSummary] = useState('');
  const [apptId, setApptId] = useState<string>(NONE);
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    const draft = !note ? localStorage.getItem(draftKey) : null;
    setRaw(note?.raw_notes ?? draft ?? '');
    setSummary(note?.summary ?? '');
    setApptId(note?.appointment_id ?? appointmentId ?? NONE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, note?.id]);

  // Rascunho local: o texto digitado não se perde se a janela fechar ou a IA falhar.
  useEffect(() => {
    if (open && !note) localStorage.setItem(draftKey, raw);
  }, [raw, open, note, draftKey]);

  const generate = async () => {
    if (raw.trim().length < 10) { toast.error('Escreva um pouco mais nas observações antes de gerar o resumo.'); return; }
    const ctl = new AbortController();
    abortRef.current = ctl;
    setGenerating(true);
    setSummary('');
    try {
      await streamConsultationSummary(clientId, raw, setSummary, ctl.signal);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error((e as Error).message);
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  };

  const handleSave = async () => {
    if (!summary.trim()) { toast.error('Gere ou escreva o resumo antes de salvar.'); return; }
    await save.mutateAsync({
      id: note?.id, raw_notes: raw, summary: summary.trim(),
      appointment_id: apptId === NONE ? null : apptId,
      owner_professional_id: note?.owner_professional_id ?? professionalId ?? null,
    });
    if (!note) localStorage.removeItem(draftKey);
    onOpenChange(false);
  };

  const close = (o: boolean) => {
    if (!o && generating) abortRef.current?.abort();
    onOpenChange(o);
  };

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto pb-safe">
        <SheetHeader>
          <SheetTitle>{note ? 'Consulta' : 'Nova consulta'}</SheetTitle>
          <SheetDescription>Escreva as observações livremente. A IA organiza um resumo para você revisar antes de salvar.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {appointments.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Agendamento (opcional)</Label>
              <Select value={apptId} onValueChange={setApptId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem agendamento</SelectItem>
                  {appointments.slice(0, 50).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {new Date(a.start_time).toLocaleDateString('pt-BR')} · {a.service?.name ?? 'Atendimento'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ccn-raw" className="text-xs">Observações da consulta</Label>
            <Textarea id="ccn-raw" value={raw} onChange={(e) => setRaw(e.target.value)} rows={7}
              placeholder="Ex.: cliente relata pele oleosa, fez limpeza de pele, orientei uso de protetor, retorno em 30 dias..." />
          </div>

          <div className="flex flex-wrap gap-2">
            {generating ? (
              <Button variant="outline" onClick={() => abortRef.current?.abort()} className="gap-2">
                <Square className="h-4 w-4" /> Parar
              </Button>
            ) : (
              <Button onClick={generate} className="gap-2" disabled={!raw.trim()}>
                {summary ? <RotateCcw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {summary ? 'Gerar de novo' : 'Gerar resumo'}
              </Button>
            )}
            {generating && <span className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Organizando...</span>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ccn-summary" className="text-xs">Resumo (revise e ajuste se precisar)</Label>
            <Textarea id="ccn-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={14}
              readOnly={generating} placeholder="O resumo organizado aparece aqui." />
            <p className="text-[11px] text-muted-foreground">Gerado por IA a partir das suas observações. Confira antes de salvar.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => close(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={generating || save.isPending || !summary.trim()} className="gap-2">
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar na ficha
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
