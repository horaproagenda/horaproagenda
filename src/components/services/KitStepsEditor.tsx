import { Plus, X, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { DurationSelect } from '@/components/ui/duration-select';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { emptyKitStep, kitTotalPrice, type KitStep } from '@/lib/kitSteps';
import { formatCurrency } from '@/lib/utils';

interface Option { id: string; name: string }

interface Props {
  steps: KitStep[];
  onChange: (steps: KitStep[]) => void;
  professionals: Option[];
  rooms: Option[];
  equipment: Option[];
}

/** Formulário manual das etapas do kit: cada etapa tem dados próprios. */
export function KitStepsEditor({ steps, onChange, professionals, rooms, equipment }: Props) {
  const hasRooms = rooms.length > 0;
  const update = (idx: number, patch: Partial<KitStep>) =>
    onChange(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  const fixFirst = (arr: KitStep[]) => (arr.length ? [{ ...arr[0], interval_days: 0 }, ...arr.slice(1)] : arr);
  const move = (idx: number, dir: -1 | 1) => {
    const arr = [...steps];
    [arr[idx], arr[idx + dir]] = [arr[idx + dir], arr[idx]];
    onChange(fixFirst(arr));
  };

  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Etapas do kit</Label>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs"
          onClick={() => onChange([...steps, emptyKitStep(steps.length === 0)])}>
          <Plus className="h-3 w-3" /> Etapa
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Preencha cada etapa: nome, duração, valor e profissional são obrigatórios{hasRooms ? ', assim como a sala' : ''}.
      </p>

      {steps.map((s, idx) => (
        <div key={idx} className="rounded border bg-muted/20 p-2 space-y-2">
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-[10px] h-5">{idx + 1}</Badge>
            <Input
              value={s.step_name}
              onChange={(e) => update(idx, { step_name: e.target.value })}
              placeholder="Nome da etapa *"
              className="h-8 flex-1 text-base sm:text-sm"
              maxLength={100}
            />
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => move(idx, -1)} aria-label="Subir etapa">
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={idx === steps.length - 1} onClick={() => move(idx, 1)} aria-label="Descer etapa">
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={steps.length === 1}
              onClick={() => onChange(fixFirst(steps.filter((_, i) => i !== idx)))} aria-label="Remover etapa">
              <X className="h-3 w-3" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">Duração *</Label>
              <DurationSelect value={s.duration_minutes ?? 0} onChange={(v) => update(idx, { duration_minutes: v })} minDuration={5} maxDuration={480} />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">Valor *</Label>
              <CurrencyInput value={s.price ?? 0} onValueChange={(v) => update(idx, { price: Math.max(0, Number(v) || 0) })} className="h-8 text-sm" />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">
                {idx === 0 ? 'Início (dia 0)' : `Dias após a etapa ${idx}`}
              </Label>
              <NumberInput min={0} max={365} emptyValue={0} value={idx === 0 ? 0 : s.interval_days} disabled={idx === 0}
                onValueChange={(v) => update(idx, { interval_days: v ?? 0 })} className="h-8 text-sm" />
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
                    <input type="checkbox" className="h-3 w-3 rounded"
                      checked={s.equipment.includes(eq.id)}
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
      ))}

      <div className="text-xs text-right text-muted-foreground">
        Valor total do kit: <span className="font-semibold text-foreground">{formatCurrency(kitTotalPrice(steps))}</span>
      </div>
    </div>
  );
}
