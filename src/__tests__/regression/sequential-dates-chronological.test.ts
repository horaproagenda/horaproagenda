import { describe, it, expect } from 'vitest';
import { sortDatesChronologically } from '@/lib/sortDatesChronologically';

describe('pacote sequencial: data mais cedo fica com a etapa de menor número', () => {
  it('ordena sem alterar horários', () => {
    const a = new Date('2027-07-21T17:10:00-03:00');
    const b = new Date('2026-10-09T17:10:00-03:00');
    const c = new Date('2026-11-11T09:00:00-03:00');
    const out = sortDatesChronologically([a, b, c]);
    expect(out.map((d) => d.toISOString())).toEqual([b, c, a].map((d) => d.toISOString()));
  });
});
