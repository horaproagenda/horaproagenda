import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type StepCommissionType = 'default' | 'percentage' | 'fixed';

interface Props {
  type: StepCommissionType;
  value: number;
  disabled?: boolean;
  onChange: (patch: { commission_type: StepCommissionType; commission_value: number }) => void;
}

/** Comissão do profissional da etapa: preenchida somente dentro da etapa. */
export function StepCommissionField({ type, value, disabled, onChange }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground">Comissão do profissional</Label>
        <Select value={type} disabled={disabled}
          onValueChange={(v) => onChange({ commission_type: v as StepCommissionType, commission_value: v === 'default' ? 0 : value })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="default" className="text-sm">Padrão do profissional</SelectItem>
            <SelectItem value="percentage" className="text-sm">Percentual (%)</SelectItem>
            <SelectItem value="fixed" className="text-sm">Valor fixo (R$)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {type !== 'default' && (
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">{type === 'percentage' ? 'Percentual *' : 'Valor *'}</Label>
          {type === 'percentage' ? (
            <NumberInput min={0} max={100} emptyValue={0} value={value}
              onValueChange={(v) => onChange({ commission_type: type, commission_value: v ?? 0 })} className="h-8 text-sm" />
          ) : (
            <CurrencyInput value={value} onValueChange={(v) => onChange({ commission_type: type, commission_value: Math.max(0, Number(v) || 0) })} className="h-8 text-sm" />
          )}
        </div>
      )}
    </div>
  );
}

export function nextStepIntervalLabel(idx: number) {
  return `Intervalo de dias para etapa seguinte nº ${idx + 2}`;
}
