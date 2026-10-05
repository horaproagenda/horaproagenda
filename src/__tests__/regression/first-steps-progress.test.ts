import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeFirstSteps } from '@/lib/firstStepsProgress';

const created = '2026-10-01T12:00:00Z';
const seeded = { created_at: '2026-10-01T12:00:02Z', updated_at: '2026-10-01T12:00:02Z' };

describe('Primeiros passos: conta nova começa com 0 de 5', () => {
  it('itens que vêm prontos não marcam passos', () => {
    const r = computeFirstSteps({
      accountCreatedAt: created,
      settings: { opening_time: '08:00:00', closing_time: '20:00:00', created_at: created, updated_at: created },
      prefs: [],
      services: 0,
      clients: 0,
      paymentMethods: Array(9).fill(seeded),
      documents: [seeded],
    });
    expect(Object.values(r).filter(Boolean)).toHaveLength(0);
  });

  it('marca o que a pessoa fez de verdade', () => {
    const r = computeFirstSteps({
      accountCreatedAt: created,
      settings: null,
      prefs: [{ opening_time: '09:00:00', closing_time: '19:00:00' }],
      services: 1,
      clients: 2,
      paymentMethods: [{ created_at: seeded.created_at, updated_at: '2026-10-02T10:00:00Z' }],
      documents: [{ created_at: '2026-10-03T10:00:00Z', updated_at: '2026-10-03T10:00:00Z' }],
    });
    expect(Object.values(r).every(Boolean)).toBe(true);
  });

  it('pular a configuração inicial não marca horários', () => {
    const src = readFileSync('src/lib/firstStepsProgress.ts', 'utf8');
    expect(src).not.toContain('onboarding_completed_at');
  });
});
