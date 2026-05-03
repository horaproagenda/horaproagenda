import { describe, it, expect } from 'vitest';
import { getAppointmentStatusConfig, getAppointmentStatusStyle, appointmentStatusConfig } from './appointmentStatus';

describe('appointmentStatus', () => {
  it('retorna config para todos os status conhecidos', () => {
    (['scheduled', 'confirmed', 'completed', 'cancelled', 'missed', 'rescheduled'] as const).forEach((s) => {
      expect(appointmentStatusConfig[s]).toBeDefined();
      expect(getAppointmentStatusConfig(s).label).toBeTruthy();
    });
  });

  it('retorna fallback "scheduled" para status nulo/desconhecido', () => {
    expect(getAppointmentStatusConfig(null).label).toBe('Agendado');
    expect(getAppointmentStatusConfig('inexistente').label).toBe('Agendado');
  });

  it('retorna estilo com border-left e background HSL', () => {
    const style = getAppointmentStatusStyle('completed');
    expect(style.borderLeft).toContain('hsl(var(--success))');
    expect(style.backgroundColor).toContain('hsl(var(--success)');
  });
});
