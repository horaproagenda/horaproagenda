import { describe, expect, it } from 'vitest';
import {
  getPackageAvailabilitySummary,
  shouldKeepAppointmentVisibleInAgenda,
  shouldShowPackageInSelector,
} from './packageAvailability';

describe('packageAvailability', () => {
  it('mantém pacote vendido com 10 aplicações visível após reagendamento e com contagem correta', () => {
    const pkg = {
      total_sessions: 10,
      sessions_scheduled: 99,
      is_active: true,
      appointments: Array.from({ length: 10 }, (_, index) => ({
        id: `sess-${index + 1}`,
        session_number: index + 1,
        status: index === 0 ? 'rescheduled' : index <= 3 ? 'scheduled' : 'pending',
        appointment_id: index <= 3 ? `apt-${index + 1}` : null,
        scheduled_date: index <= 3 ? `2026-04-${String(index + 1).padStart(2, '0')}T12:00:00` : null,
      })),
    };

    const summary = getPackageAvailabilitySummary(pkg);

    expect(shouldShowPackageInSelector(pkg)).toBe(true);
    expect(summary.totalSessions).toBe(10);
    expect(summary.existingSessionRecords).toBe(10);
    expect(summary.scheduledAppointments).toBe(4);
    expect(summary.consumedSessions).toBe(0);
    expect(summary.schedulableSessions).toBe(6);
    expect(summary.remainingSessions).toBe(10);
    expect(summary.hasInconsistentCounter).toBe(true);
  });

  it('mantém agendamentos de pacote visíveis mesmo com status reagendado', () => {
    expect(shouldKeepAppointmentVisibleInAgenda({ status: 'rescheduled', package_appointment_id: 'sess-1' })).toBe(true);
    expect(shouldKeepAppointmentVisibleInAgenda({ status: 'rescheduled', package_appointment: { id: 'sess-1' } })).toBe(true);
    expect(shouldKeepAppointmentVisibleInAgenda({ status: 'rescheduled' })).toBe(false);
  });
});