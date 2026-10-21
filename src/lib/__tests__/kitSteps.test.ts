import { describe, it, expect } from 'vitest';
import { validateKitSteps, serializeKitSteps, appointmentBasePrice, kitTotalPrice, type KitStep } from '../kitSteps';

const ok: KitStep = { step_name: 'Limpeza', duration_minutes: 30, price: 80, professional_id: 'p1', room_id: 'r1', equipment: [], interval_days: 0 };

describe('kit steps', () => {
  it('exige nome da etapa', () => expect(validateKitSteps([{ ...ok, step_name: ' ' }], true)).toMatch(/nome/));
  it('exige duração', () => expect(validateKitSteps([{ ...ok, duration_minutes: null }], true)).toMatch(/duração/));
  it('exige valor', () => expect(validateKitSteps([{ ...ok, price: null }], true)).toMatch(/valor/));
  it('exige profissional', () => expect(validateKitSteps([{ ...ok, professional_id: '' }], true)).toMatch(/profissional/));
  it('exige sala quando há salas', () => expect(validateKitSteps([{ ...ok, room_id: '' }], true)).toMatch(/sala/));
  it('sala opcional sem salas cadastradas', () => expect(validateKitSteps([{ ...ok, room_id: '' }], false)).toBeNull());
  it('primeira etapa grava intervalo 0', () => expect(serializeKitSteps([{ ...ok, interval_days: 9 }])[0].interval_days).toBe(0));
  it('valor total é a soma das etapas', () => expect(kitTotalPrice([ok, { ...ok, price: 50 }])).toBe(130));
  it('valor da etapa tem prioridade sobre o serviço', () => {
    expect(appointmentBasePrice({ price_snapshot: 50, service: { price: 250 } })).toBe(50);
    expect(appointmentBasePrice({ price_snapshot: null, service: { price: 250 } })).toBe(250);
  });
});
