import { describe, it, expect } from 'vitest';
import { inclusiveDays, averageCycleDays, effectiveDurationDays, forecastEndDate } from '../generalUsageForecast';

describe('generalUsageForecast', () => {
  it('conta dias inclusivos', () => { expect(inclusiveDays('2026-10-07', '2026-10-27')).toBe(21); expect(inclusiveDays('2026-10-07', '2026-10-07')).toBe(1); });
  it('calcula a média dos ciclos concluídos e ignora o aberto', () => {
    expect(averageCycleDays([{ started_at: '2026-01-01', finished_at: '2026-01-10' }, { started_at: '2026-02-01', finished_at: '2026-02-20' }, { started_at: '2026-03-01', finished_at: null }])).toBe(15);
  });
  it('duração informada tem prioridade sobre a calculada', () => {
    expect(effectiveDurationDays(30, [{ started_at: '2026-01-01', finished_at: '2026-01-10' }])).toEqual({ days: 30, source: 'informed' });
    expect(effectiveDurationDays(null, [{ started_at: '2026-01-01', finished_at: '2026-01-10' }])).toEqual({ days: 10, source: 'calculated' });
    expect(effectiveDurationDays(null, [])).toBeNull();
  });
  it('prevê término atravessando o mês', () => { expect(forecastEndDate('2026-01-25', 10)).toBe('2026-02-03'); });
});
