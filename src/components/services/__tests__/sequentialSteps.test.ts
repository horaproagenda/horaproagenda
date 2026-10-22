import { describe, it, expect } from 'vitest';
import { validateSequentialSteps, serializeSequentialSteps, type SequentialStepDraft } from '../SequentialStepsEditor';

const ok = (p: Partial<SequentialStepDraft> = {}): SequentialStepDraft => ({
  step_name: 'Etapa', duration_minutes: 60, professional_id: 'p1', room_id: 'r1', equipment: [], interval_after_days: 7, commission_type: 'default', commission_value: 0, ...p,
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

describe('etapas: comissão e rótulo do intervalo', () => {
  it('rótulo indica o número da etapa seguinte', async () => {
    const { nextStepIntervalLabel } = await import('../StepCommissionField');
    expect(nextStepIntervalLabel(0)).toBe('Intervalo de dias para etapa seguinte nº 2');
  });
  it('grava comissão própria da etapa', () => {
    const rows = serializeSequentialSteps('t', [ok({ commission_type: 'percentage', commission_value: 30 })]);
    expect(rows[0]).toMatchObject({ commission_type: 'percentage', commission_value: 30 });
  });
  it('rejeita percentual acima de 100', () => {
    expect(validateSequentialSteps([ok({ commission_type: 'percentage', commission_value: 120 })], false)).toMatch(/Comissão/);
  });
});
