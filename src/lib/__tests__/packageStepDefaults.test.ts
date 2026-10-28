import { describe, expect, it } from 'vitest';
import { resolveStepBookingResources } from '../packageStepDefaults';

describe('resolveStepBookingResources (pacote sequencial)', () => {
  it('usa o profissional, a sala e o equipamento da própria etapa', () => {
    const result = resolveStepBookingResources(
      {
        default_professional_id: 'prof-etapa-2',
        default_room_id: 'sala-2',
        default_equipment: ['equip-2'],
      },
      { professionalId: 'prof-form', roomId: 'sala-form', equipmentId: 'equip-form' },
      { professional_id: 'prof-pacote', room_id: 'sala-pacote' },
    );
    expect(result).toEqual({
      professionalId: 'prof-etapa-2',
      roomId: 'sala-2',
      equipmentId: 'equip-2',
    });
  });

  it('cai para o formulário quando a etapa não tem o dado', () => {
    const result = resolveStepBookingResources(
      { default_professional_id: null, default_room_id: null, default_equipment: [] },
      { professionalId: 'prof-form', roomId: 'sala-form', equipmentId: 'equip-form' },
      { professional_id: 'prof-pacote', room_id: 'sala-pacote' },
    );
    expect(result).toEqual({
      professionalId: 'prof-form',
      roomId: 'sala-form',
      equipmentId: 'equip-form',
    });
  });

  it('cai para o pacote quando nem a etapa nem o formulário têm o dado', () => {
    const result = resolveStepBookingResources(
      null,
      { professionalId: null, roomId: null, equipmentId: null },
      { professional_id: 'prof-pacote', room_id: 'sala-pacote' },
    );
    expect(result.professionalId).toBe('prof-pacote');
    expect(result.roomId).toBe('sala-pacote');
    expect(result.equipmentId).toBeNull();
  });

  it('ignora equipamento da etapa quando não é lista válida', () => {
    const result = resolveStepBookingResources(
      { default_equipment: 'nao-e-lista' },
      { equipmentId: 'equip-form' },
      null,
    );
    expect(result.equipmentId).toBe('equip-form');
  });
});
