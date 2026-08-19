import { describe, it, expect } from 'vitest';
import { buildMonthGridDays, buildWeekDays, gridColumnsStyle, weekdayLabels } from './agendaGrid';

describe('agendaGrid', () => {
  it('semana começa na segunda e remove domingo quando ocultado', () => {
    const ref = new Date('2026-06-10T12:00:00'); // quarta
    expect(buildWeekDays(ref, false)).toHaveLength(7);
    const visible = buildWeekDays(ref, true);
    expect(visible).toHaveLength(6);
    expect(visible.some((d) => d.getDay() === 0)).toBe(false);
    expect(visible[0].getDay()).toBe(1);
  });

  it('mês mantém alinhamento em múltiplos de 6 ao ocultar domingo', () => {
    for (const iso of ['2026-06-01', '2026-02-01', '2026-11-01', '2026-03-01']) {
      const days = buildMonthGridDays(new Date(`${iso}T12:00:00`), true);
      expect(days.length % 6).toBe(0);
      expect(days.some((d) => d.getDay() === 0)).toBe(false);
      expect(days[0].getDay()).toBe(1);
    }
  });

  it('mês completo é múltiplo de 7', () => {
    const days = buildMonthGridDays(new Date('2026-06-01T12:00:00'), false);
    expect(days.length % 7).toBe(0);
  });

  it('rótulos e colunas acompanham a preferência', () => {
    expect(weekdayLabels(true)).toEqual(['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']);
    expect(weekdayLabels(false)).toHaveLength(7);
    expect(gridColumnsStyle(6).gridTemplateColumns).toBe('repeat(6, minmax(0, 1fr))');
  });
});
