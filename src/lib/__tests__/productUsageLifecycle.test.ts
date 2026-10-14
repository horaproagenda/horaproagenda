import { describe, expect, it } from 'vitest';
import { usageClosure, usageDurationDays } from '../productUsageLifecycle';

describe('registro de uso por datas', () => {
  it('14/10 a 14/10 dura 1 dia', () => expect(usageDurationDays('2026-10-14', '2026-10-14')).toBe(1));
  it('término 13/10 não aceita início 14/10', () => expect(usageDurationDays('2026-10-14', '2026-10-13')).toBeNull());
  it('sem término não inventa duração', () => expect(usageDurationDays('2026-10-14', null)).toBeNull());
  it('600 menos ciclo de 100 deixa 500', () => expect(usageClosure(600, 100, 40).stockAfter).toBe(500));
  it('nova tentativa não repete baixa', () => expect(usageClosure(500, 100, 40, true).stockAfter).toBe(500));
  it('100 em 40 atendimentos dá média 2,5', () => expect(usageClosure(600, 100, 40).average).toBe(2.5));
  it('zero atendimentos não cria média', () => expect(usageClosure(600, 100, 0).average).toBeNull());
  it('quantidade maior que estoque é recusada', () => expect(() => usageClosure(50, 100, 0)).toThrow());
});