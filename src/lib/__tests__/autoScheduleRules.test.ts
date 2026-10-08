import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { applyAutoScheduleRule } from '../autoScheduleRules';
import { formatDateInTimeZone, formatTimeInTimeZone } from '../timezone';
const tz = 'America/Sao_Paulo';
const wd = (d: Date) => new Date(`${formatDateInTimeZone(d, tz)}T12:00:00Z`).getUTCDay();

describe('regra do agendamento automático ao ajustar os seguintes', () => {
  it('mantém quinta-feira às 14h', () => {
    const r = applyAutoScheduleRule(new Date('2026-10-17T13:00:00Z'), { preferred_day_of_week: 4, preferred_time: '14:00' }, tz);
    expect(wd(r)).toBe(4);
    expect(formatTimeInTimeZone(r, tz)).toBe('14:00');
    expect(formatDateInTimeZone(r, tz)).toBe('2026-10-22');
  });
  it('mantém sábado e nunca recua a data', () => {
    const r = applyAutoScheduleRule(new Date('2026-10-12T15:00:00Z'), { preferred_day_of_week: 6, preferred_time: null }, tz);
    expect(formatDateInTimeZone(r, tz)).toBe('2026-10-17');
    expect(formatTimeInTimeZone(r, tz)).toBe('12:00');
  });
  it('sem regra (agendamento manual) não altera nada', () => {
    const d = new Date('2026-10-13T15:00:00Z');
    expect(applyAutoScheduleRule(d, null, tz).getTime()).toBe(d.getTime());
  });
});
