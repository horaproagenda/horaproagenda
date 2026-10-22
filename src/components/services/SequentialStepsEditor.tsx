import { Plus, X, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { DurationSelect } from '@/components/ui/duration-select';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface SequentialStepDraft {
  step_name: string;
  duration_minutes: number;
  professional_id: string;
  room_id: string;
  equipment: string[];
  /** Dias até a próxima etapa (última etapa = 0). */
  interval_after_days: number;
}

interface Option { id: string; name: string }

export const emptySequentialStep = (): SequentialStepDraft => ({
  step_name: '', duration_minutes: 60, professional_id: '', room_id: '', equipment: [], interval_after_days: 7,
});

/** Validação das etapas independentes do pacote sequencial. Retorna mensagem ou null. */
export function validateSequentialSteps(steps: SequentialStepDraft[], hasRooms: boolean): string | null {
  if (steps.length === 0) return 'Adicione pelo menos uma etapa.';
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const n = i + 1;
    if (!s.step_name.trim()) return `Informe o nome da etapa ${n}.`;
    if (!s.duration_minutes || s.duration_minutes < 5) return `Informe a duração da etapa ${n}.`;
    if (!s.professional_id) return `Selecione o profissional da etapa ${n}.`;
    if (hasRooms && !s.room_id) return `Selecione a sala da etapa ${n}.`;
    if (i < steps.length - 1 && (!s.interval_after_days || s.interval_after_days < 1)) {
      return `Informe o intervalo (mínimo 1 dia) após a etapa ${n}.`;
    }
  }
  return null;
}

/** Converte etapas para as linhas gravadas no banco, sem vínculo com serviços cadastrados. */
export function serializeSequentialSteps(templateId: string, steps: SequentialStepDraft[]) {
  return steps.map((s, i) => ({
    template_id: templateId,
    service_id: null,
    step_name: s.step_name.trim(),
    duration_minutes: s.duration_minutes,
    default_professional_id: s.professional_id || null,
    default_room_id: s.room_id || null,
    default_equipment: s.equipment,
    sequence_order: i + 1,
    interval_after_days: i === steps.length - 1 ? 0 : s.interval_after_days,
  }));
}

interface Props {
  steps: SequentialStepDraft[];
  onChange: (steps: SequentialStepDraft[]) => void;
  professionals: Option[];
  rooms: Option[];
  equipment: Option[];
}

/** Formulário manual das etapas do pacote sequencial: cada etapa tem dados próprios. */
export function SequentialStepsEditor({ steps, onChange, professionals, rooms, equipment }: Props) {
  const hasRooms = rooms.length > 0;
  const update = (idx: number, patch: Partial<SequentialStepDraft>) =>
    onChange(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  const move = (idx: number, dir: -1 | 1) => {
    const arr = [...steps];
    [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]];
    onChange(arr);
  };

  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Etapas do pacote</Label>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs"
          onClick={() => onChange([...steps, emptySequentialStep()])}>
          <Plus className="h-3 w-3" /> Etapa
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Preencha cada etapa: nome, duração, profissional{hasRooms ? ', sala' : ''} e intervalo são obrigatórios.
      </p>

      {steps.map((s, idx) => {
        const isLast = idx === steps.length - 1;
        return (
          <div key={idx} className="rounded border bg-muted/20 p-2 space-y-2">
            <div className="flex items-center gap-1">
              <Badge variant="secondary" className="text-[10px] h-5">{idx + 1}</Badge>
              <Input value={s.step_name} onChange={(e) => update(idx, { step_name: e.target.value })}
                placeholder="Nome da etapa *" className="h-8 flex-1 text-base sm:text-sm" maxLength={100} />
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => move(idx, -1)} aria-label="Subir etapa">
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={isLast} onClick={() => move(idx, 1)} aria-label="Descer etapa">
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={steps.length === 1}
                onClick={() => onChange(steps.filter((_, i) => i !== idx))} aria-label="Remover etapa">
                <X className="h-3 w-3" />
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">Duração *</Label>
                <DurationSelect value={s.duration_minutes || 0} onChange={(v) => update(idx, { duration_minutes: v })} minDuration={5} maxDuration={480} />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">
                  {isLast ? 'Última etapa' : 'Dias até a próxima etapa *'}
                </Label>
                <NumberInput min={isLast ? 0 : 1} max={365} emptyValue={0} value={isLast ? 0 : s.interval_after_days} disabled={isLast}
                  onValueChange={(v) => update(idx, { interval_after_days: v ?? 0 })} className="h-8 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">Profissional *</Label>
                <Select value={s.professional_id || undefined} onValueChange={(v) => update(idx, { professional_id: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {professionals.map((p) => <SelectItem key={p.id} value={p.id} className="text-sm">{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {hasRooms && (
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">Sala *</Label>
                  <Select value={s.room_id || undefined} onValueChange={(v) => update(idx, { room_id: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {rooms.map((r) => <SelectItem key={r.id} value={r.id} className="text-sm">{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {equipment.length > 0 && (
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">Equipamento</Label>
                <div className="flex flex-wrap gap-2">
                  {equipment.map((eq) => (
                    <label key={eq.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="checkbox" className="h-3 w-3 rounded" checked={s.equipment.includes(eq.id)}
                        onChange={(e) => update(idx, {
                          equipment: e.target.checked ? [...s.equipment, eq.id] : s.equipment.filter((id) => id !== eq.id),
                        })} />
                      {eq.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[10px] text-muted-foreground">Total de etapas: <span className="font-medium text-foreground">{steps.length}</span></p>
    </div>
  );
}
