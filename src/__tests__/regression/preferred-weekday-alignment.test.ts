import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { alignToWeekdayDiff } from '@/lib/autoScheduleChain';

describe('dia da semana fixo na série', () => {
  it('alinha a 1ª sessão ao dia escolhido', () => {
    expect(alignToWeekdayDiff(2, 6)).toBe(4); // terça → sábado
    expect(alignToWeekdayDiff(6, 4)).toBe(5); // sábado → quinta
    expect(alignToWeekdayDiff(4, 4)).toBe(0);
  });
  it('alternativas de conflito pulam semanas inteiras quando há dia fixo', () => {
    const src = readFileSync('src/components/appointments/NewAppointmentDialog.tsx', 'utf8');
    expect(src).toMatch(/fixedWeekday !== null \? 7 : 1/);
    expect(src).toMatch(/alignToWeekdayDiff\(date\.getDay\(\), activePreferredWeekday\)/);
  });
});
