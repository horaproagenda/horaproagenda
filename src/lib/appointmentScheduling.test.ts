import { describe, expect, it } from 'vitest';
import { calculateAppointmentTimesInTimeZone, getAvailabilityConflictReason } from './appointmentScheduling';
import { formatTimeInTimeZone } from './timezone';

describe('appointment scheduling with configured timezone', () => {
  it('cria início e fim respeitando o fuso configurado e duração em minutos', () => {
    const date = new Date('2026-01-15T12:00:00');
    const { startTime, endTime } = calculateAppointmentTimesInTimeZone(date, '09:30', 90, 'America/Sao_Paulo');

    expect(formatTimeInTimeZone(startTime, 'America/Sao_Paulo')).toBe('09:30');
    expect(formatTimeInTimeZone(endTime, 'America/Sao_Paulo')).toBe('11:00');
    expect(endTime.getTime() - startTime.getTime()).toBe(90 * 60_000);
  });

  it('mantém end time correto em fusos diferentes', () => {
    const date = new Date('2026-07-10T12:00:00');
    const saoPaulo = calculateAppointmentTimesInTimeZone(date, '10:00', 45, 'America/Sao_Paulo');
    const manaus = calculateAppointmentTimesInTimeZone(date, '10:00', 45, 'America/Manaus');

    expect(formatTimeInTimeZone(saoPaulo.startTime, 'America/Sao_Paulo')).toBe('10:00');
    expect(formatTimeInTimeZone(saoPaulo.endTime, 'America/Sao_Paulo')).toBe('10:45');
    expect(formatTimeInTimeZone(manaus.startTime, 'America/Manaus')).toBe('10:00');
    expect(formatTimeInTimeZone(manaus.endTime, 'America/Manaus')).toBe('10:45');
  });

  it('detecta conflitos de profissional e libera horários adjacentes sem sobreposição', () => {
    const date = new Date('2026-03-20T12:00:00');
    const existing = calculateAppointmentTimesInTimeZone(date, '09:00', 60, 'America/Sao_Paulo');
    const overlapping = calculateAppointmentTimesInTimeZone(date, '09:30', 30, 'America/Sao_Paulo');
    const adjacent = calculateAppointmentTimesInTimeZone(date, '10:00', 30, 'America/Sao_Paulo');
    const context = {
      selectedProfessional: 'prof-1',
      appointments: [{
        professional_id: 'prof-1',
        start_time: existing.startTime.toISOString(),
        end_time: existing.endTime.toISOString(),
      }],
    };

    expect(getAvailabilityConflictReason(overlapping.startTime, overlapping.endTime, context)).toBe('Profissional ocupado');
    expect(getAvailabilityConflictReason(adjacent.startTime, adjacent.endTime, context)).toBe('');
  });

  it('detecta indisponibilidade por ausência no fuso configurado', () => {
    const date = new Date('2026-04-22T12:00:00');
    const absence = calculateAppointmentTimesInTimeZone(date, '14:00', 120, 'America/Sao_Paulo');
    const appointment = calculateAppointmentTimesInTimeZone(date, '15:30', 30, 'America/Sao_Paulo');

    expect(getAvailabilityConflictReason(appointment.startTime, appointment.endTime, {
      selectedProfessional: 'prof-2',
      appointments: [],
      absences: [{
        professional_id: 'prof-2',
        start_time: absence.startTime.toISOString(),
        end_time: absence.endTime.toISOString(),
      }],
    })).toBe('Profissional ausente');
  });
});