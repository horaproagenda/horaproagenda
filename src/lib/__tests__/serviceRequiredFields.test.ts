import { describe, it, expect } from 'vitest';
import { validateServiceRequiredFields as v } from '../serviceRequiredFields';

describe('validateServiceRequiredFields', () => {
  it('exige retorno em dias', () => {
    expect(v({ return_days: null, professional_id: 'p' }, false)).toMatch(/retorno/);
    expect(v({ return_days: 0, professional_id: 'p' }, false)).toMatch(/retorno/);
  });
  it('exige profissional', () => {
    expect(v({ return_days: 30, professional_id: '' }, false)).toMatch(/profissional/);
  });
  it('exige sala somente quando há salas ativas', () => {
    expect(v({ return_days: 30, professional_id: 'p', room_id: '' }, true)).toMatch(/sala/);
    expect(v({ return_days: 30, professional_id: 'p', room_id: '' }, false)).toBeNull();
    expect(v({ return_days: 30, professional_id: 'p', room_id: 'r' }, true)).toBeNull();
  });
});
