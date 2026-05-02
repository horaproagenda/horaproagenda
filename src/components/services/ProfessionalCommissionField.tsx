import { useEffect, useState } from 'react';
import { Percent, DollarSign, Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { useProfessionals } from '@/hooks/useProfessionals';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

export interface CommissionOverride {
  enabled: boolean;
  type: 'percentage' | 'fixed';
  percentage: number;
  fixed_value: number;
}

interface Props {
  professionalId: string | null | undefined;
  serviceId?: string | null;
  value: CommissionOverride;
  onChange: (next: CommissionOverride) => void;
  /** Compact layout for inside dialogs */
  compact?: boolean;
}

/**
 * Shows the default commission of the selected professional and lets the user
 * define a per-service override that gets saved into
 * `professional_service_commissions` (synced with reports/cashier/finance).
 */
export function ProfessionalCommissionField({
  professionalId,
  serviceId,
  value,
  onChange,
  compact = true,
}: Props) {
  const { professionals } = useProfessionals();
  const professional = professionals.find(p => p.id === professionalId);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Fetch existing override for (professional, service) if editing
  const { data: existingOverride } = useQuery({
    queryKey: ['professional_service_commission', professionalId, serviceId],
    queryFn: async () => {
      if (!professionalId || !serviceId) return null;
      const { data } = await supabase
        .from('professional_service_commissions' as any)
        .select('*')
        .eq('professional_id', professionalId)
        .eq('service_id', serviceId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!professionalId && !!serviceId,
  });

  // Hydrate from existing override
  useEffect(() => {
    if (!professionalId) return;
    const key = `${professionalId}:${serviceId || 'new'}`;
    if (loadedFor === key) return;
    if (existingOverride) {
      onChange({
        enabled: true,
        type: (existingOverride.commission_type as 'percentage' | 'fixed') || 'percentage',
        percentage: Number(existingOverride.commission_percentage) || 0,
        fixed_value: Number(existingOverride.commission_fixed_value) || 0,
      });
      setLoadedFor(key);
    } else if (serviceId !== undefined) {
      // Reset to default when switching to a service without override
      setLoadedFor(key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingOverride, professionalId, serviceId]);

  if (!professionalId) return null;

  const defaultType = (professional as any)?.commission_type || 'percentage';
  const defaultPct = Number((professional as any)?.commission_percentage) || 0;
  const defaultFixed = Number((professional as any)?.commission_fixed_value) || 0;

  return (
    <div className={`rounded-md border p-3 space-y-2 bg-muted/30 ${compact ? 'text-xs' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium text-xs">Comissão do profissional</span>
        </div>
        <Badge variant="secondary" className="text-[10px] gap-1">
          {defaultType === 'fixed' ? (
            <><DollarSign className="h-3 w-3" /> Fixo R$ {defaultFixed.toFixed(2)}</>
          ) : defaultType === 'both' ? (
            <><Percent className="h-3 w-3" /> {defaultPct}% + R$ {defaultFixed.toFixed(2)}</>
          ) : (
            <><Percent className="h-3 w-3" /> {defaultPct}%</>
          )}
        </Badge>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t">
        <Label className="text-[11px] text-muted-foreground">
          Definir comissão específica para este serviço
        </Label>
        <Switch
          checked={value.enabled}
          onCheckedChange={(v) => onChange({ ...value, enabled: v })}
        />
      </div>

      {value.enabled && (
        <div className="space-y-2 pt-1">
          <RadioGroup
            value={value.type}
            onValueChange={(v) => onChange({ ...value, type: v as 'percentage' | 'fixed' })}
            className="flex gap-4"
          >
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="percentage" id="comm-pct" className="h-3.5 w-3.5" />
              <Label htmlFor="comm-pct" className="text-xs cursor-pointer">Porcentagem</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="fixed" id="comm-fix" className="h-3.5 w-3.5" />
              <Label htmlFor="comm-fix" className="text-xs cursor-pointer">Valor fixo</Label>
            </div>
          </RadioGroup>

          {value.type === 'percentage' ? (
            <div>
              <Label className="text-[11px]">Porcentagem (%)</Label>
              <Input
                type="number" min={0} max={100} step={0.5}
                value={value.percentage}
                onChange={e => onChange({ ...value, percentage: Number(e.target.value) })}
                className="h-8 text-xs mt-1"
              />
            </div>
          ) : (
            <div>
              <Label className="text-[11px]">Valor fixo (R$)</Label>
              <Input
                type="number" min={0} step={0.01}
                value={value.fixed_value}
                onChange={e => onChange({ ...value, fixed_value: Number(e.target.value) })}
                className="h-8 text-xs mt-1"
              />
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Esta configuração será aplicada nos relatórios de comissão, lembretes a pagar e caixa.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Persist commission override: insert/update/delete on `professional_service_commissions`.
 * Returns silently on success. Throws on error.
 */
export async function saveCommissionOverride(
  professionalId: string | null | undefined,
  serviceId: string | null | undefined,
  override: CommissionOverride,
) {
  if (!professionalId || !serviceId) return;

  if (!override.enabled) {
    // Remove override if it existed
    await supabase
      .from('professional_service_commissions' as any)
      .delete()
      .eq('professional_id', professionalId)
      .eq('service_id', serviceId);
    return;
  }

  const payload = {
    professional_id: professionalId,
    service_id: serviceId,
    commission_type: override.type,
    commission_percentage: override.type === 'percentage' ? override.percentage : 0,
    commission_fixed_value: override.type === 'fixed' ? override.fixed_value : 0,
  };

  // Try update first; if no row, insert
  const { data: existing } = await supabase
    .from('professional_service_commissions' as any)
    .select('id')
    .eq('professional_id', professionalId)
    .eq('service_id', serviceId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('professional_service_commissions' as any)
      .update(payload)
      .eq('id', (existing as any).id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('professional_service_commissions' as any)
      .insert(payload);
    if (error) throw error;
  }
}

export const defaultCommissionOverride: CommissionOverride = {
  enabled: false,
  type: 'percentage',
  percentage: 0,
  fixed_value: 0,
};
