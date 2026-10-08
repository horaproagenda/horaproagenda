import { supabase } from '@/integrations/supabase/client';
import { clinicDateTime, formatDateInTimeZone } from '@/lib/timezone';

/**
 * Regra original de um agendamento automático (dia da semana / horário),
 * guardada por grupo: série de serviço (recurring_group_id), pacote vendido
 * (package_id) ou kit (composite_group_id). Só é usada quando o profissional
 * escolhe "ajustar os seguintes"; edições individuais continuam livres.
 */
export interface AutoScheduleRule {
  preferred_day_of_week: number | null;
  preferred_time: string | null;
}

export type AutoRuleGroupType = 'recurring' | 'package' | 'kit';

export async function saveAutoScheduleRule(
  groupId: string | null | undefined,
  groupType: AutoRuleGroupType,
  rule: { preferredDayOfWeek?: number | null; preferredTime?: string | null },
) {
  if (!groupId) return;
  const day = rule.preferredDayOfWeek ?? null;
  const time = rule.preferredTime || null;
  if (day === null && !time) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('auto_schedule_rules').upsert({
    group_id: groupId,
    group_type: groupType,
    preferred_day_of_week: day,
    preferred_time: time,
  });
  if (error) console.warn('[autoScheduleRules] save failed', error);
}

export async function loadAutoScheduleRule(groupId: string | null | undefined): Promise<AutoScheduleRule | null> {
  if (!groupId) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('auto_schedule_rules')
    .select('preferred_day_of_week, preferred_time')
    .eq('group_id', groupId)
    .maybeSingle();
  return (data as AutoScheduleRule) || null;
}

/**
 * Aplica a regra a uma data proposta: avança (nunca recua) até o dia da
 * semana registrado e fixa o horário registrado, no fuso do estabelecimento.
 * Sem regra, devolve a data como está.
 */
export function applyAutoScheduleRule(
  proposed: Date,
  rule: AutoScheduleRule | null,
  timeZone = 'America/Sao_Paulo',
): Date {
  if (!rule || (rule.preferred_day_of_week == null && !rule.preferred_time)) return proposed;
  const ymd = formatDateInTimeZone(proposed, timeZone);
  let day = new Date(`${ymd}T12:00:00Z`);
  if (rule.preferred_day_of_week != null) {
    const diff = (rule.preferred_day_of_week - day.getUTCDay() + 7) % 7;
    day = new Date(day.getTime() + diff * 86400000);
  }
  const hhmm = rule.preferred_time
    ? rule.preferred_time.slice(0, 5)
    : new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(proposed);
  const dayStr = day.toISOString().slice(0, 10);
  return clinicDateTime(dayStr, hhmm, timeZone);
}
