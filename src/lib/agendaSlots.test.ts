import { describe, it, expect } from 'vitest';
import { mergeAgendaTimeSlots } from './agendaSlots';
import { Appointment } from '@/types';

const baseSlots = ['08:00', '09:00', '10:00', '11:00'];

const makeAppointment = (start: string, end: string, status = 'scheduled'): Appointment =>
  ({
    id: `apt-${start}`,
    start_time: start,
    end_time: end,
    status,
  } as unknown as Appointment);

describe('mergeAgendaTimeSlots', () => {
  it('inclui horários de agendamentos fora dos slots base (visualização dia)', () => {
    const selectedDate = new Date('2026-05-10T12:00:00');
    const result = mergeAgendaTimeSlots({
      baseSlots,
      appointments: [makeAppointment('2026-05-10T09:15:00', '2026-05-10T09:45:00')],
      absences: [],
      viewType: 'day',
      selectedDate,
      weekStart: selectedDate,
      monthStart: selectedDate,
      hideSunday: false,
    });
    expect(result).toContain('09:15');
    expect(result).toContain('09:00');
  });

  it('inclui horários de ausências do profissional', () => {
    const selectedDate = new Date('2026-05-10T12:00:00');
    const result = mergeAgendaTimeSlots({
      baseSlots,
      appointments: [],
      absences: [{ start_time: '2026-05-10T08:30:00', end_time: '2026-05-10T09:00:00' }],
      viewType: 'day',
      selectedDate,
      weekStart: selectedDate,
      monthStart: selectedDate,
      hideSunday: false,
    });
    expect(result).toContain('08:30');
  });

  it('ignora agendamentos com status reagendado', () => {
    const selectedDate = new Date('2026-05-10T12:00:00');
    const result = mergeAgendaTimeSlots({
      baseSlots,
      appointments: [makeAppointment('2026-05-10T07:15:00', '2026-05-10T07:45:00', 'rescheduled')],
      absences: [],
      viewType: 'day',
      selectedDate,
      weekStart: selectedDate,
      monthStart: selectedDate,
      hideSunday: false,
    });
    expect(result).not.toContain('07:15');
  });

  it('retorna lista ordenada e sem duplicatas', () => {
    const selectedDate = new Date('2026-05-10T12:00:00');
    const result = mergeAgendaTimeSlots({
      baseSlots: ['10:00', '08:00', '09:00'],
      appointments: [makeAppointment('2026-05-10T09:00:00', '2026-05-10T09:30:00')],
      absences: [],
      viewType: 'day',
      selectedDate,
      weekStart: selectedDate,
      monthStart: selectedDate,
      hideSunday: false,
    });
    expect(result).toEqual([...result].sort());
    expect(new Set(result).size).toBe(result.length);
  });
});
