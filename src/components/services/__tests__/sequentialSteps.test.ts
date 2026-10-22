import { describe, it, expect } from 'vitest';
import { validateSequentialSteps, serializeSequentialSteps, type SequentialStepDraft } from '../SequentialStepsEditor';

const ok = (p: Partial<SequentialStepDraft> = {}): SequentialStepDraft => ({
  step_name: 'Etapa', duration_minutes: 60, professional_id: 'p1', room_id: 'r1', equipment: [], interval_after_days: 7, ...p,
});

describe('etapas independentes do pacote sequencial', () => {
  it('exige nome, duração e profissional', () => {
    expect(validateSequentialSteps([ok({ step_name: ' ' })], false)).toMatch(/nome/);
    expect(validateSequentialSteps([ok({ duration_minutes: 0 })], false)).toMatch(/duração/);
    expect(validateSequentialSteps([ok({ professional_id: '' })], false)).toMatch(/profissional/);
  });
  it('exige sala somente quando há salas cadastradas', () => {
    expect(validateSequentialSteps([ok({ room_id: '' })], true)).toMatch(/sala/);
    expect(validateSequentialSteps([ok({ room_id: '' })], false)).toBeNull();
  });
  it('exige intervalo de pelo menos 1 dia entre etapas', () => {
    expect(validateSequentialSteps([ok({ interval_after_days: 0 }), ok()], false)).toMatch(/intervalo/);
  });
  it('grava sem vínculo com serviço e última etapa com intervalo 0', () => {
    const rows = serializeSequentialSteps('t1', [ok(), ok({ step_name: 'Final' })]);
    expect(rows.every(r => r.service_id === null)).toBe(true);
    expect(rows[1]).toMatchObject({ step_name: 'Final', sequence_order: 2, interval_after_days: 0, default_professional_id: 'p1' });
  });
});
