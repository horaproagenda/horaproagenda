import { describe, expect, it } from 'vitest';
import {
  buildAppointmentPackageSequenceMap,
  buildAppointmentRecurringSequenceMap,
  countRealizedPackageSessions,
  formatAppointmentNotesWithRecurringSequence,
  getAppointmentPackageApplicationLabel,
  getAppointmentRecurringSessionLabel,
  getPackageApplicationLabel,
  isPackageSessionRealized,
} from './packageSequence';

describe('packageSequence', () => {
  it('numera aplicações por data sem alterar o número original salvo', () => {
    const appointments = [
      { id: 'apt-10', start_time: '2026-05-07T19:00:00', package_appointment: { id: 's10', package_id: 'pkg', session_number: 10, original_session_number: 10, package: { id: 'pkg', total_sessions: 10 } } },
      { id: 'apt-1', start_time: '2026-04-01T19:00:00', package_appointment: { id: 's1', package_id: 'pkg', session_number: 1, original_session_number: 1, package: { id: 'pkg', total_sessions: 10 } } },
      { id: 'apt-2', start_time: '2026-04-15T19:00:00', package_appointment: { id: 's2', package_id: 'pkg', session_number: 2, original_session_number: 2, package: { id: 'pkg', total_sessions: 10 } } },
    ] as any[];

    const sequence = buildAppointmentPackageSequenceMap(appointments);

    expect(getAppointmentPackageApplicationLabel(appointments[0], sequence.get('apt-10'))).toBe('Aplicação 3/10');
    expect(appointments[0].package_appointment.original_session_number).toBe(10);
  });

  it('trata faltou como aplicação realizada para créditos e relatórios', () => {
    expect(isPackageSessionRealized('missed')).toBe(true);
    expect(countRealizedPackageSessions(['completed', 'missed', 'cancelled'])).toBe(2);
  });

  it('exibe hífen quando não houver sessão de pacote', () => {
    expect(getPackageApplicationLabel(null, 10)).toBe('-');
  });

  it('mantém sessões de pacote reagendadas na sequência visível da agenda', () => {
    const appointments = [
      { id: 'apt-old', status: 'rescheduled', start_time: '2026-04-01T19:00:00', package_appointment_id: 's1', package_appointment: { id: 's1', package_id: 'pkg', session_number: 1, status: 'rescheduled', package: { id: 'pkg', total_sessions: 2 } } },
      { id: 'apt-next', status: 'scheduled', start_time: '2026-04-08T19:00:00', package_appointment_id: 's2', package_appointment: { id: 's2', package_id: 'pkg', session_number: 2, status: 'scheduled', package: { id: 'pkg', total_sessions: 2 } } },
    ] as any[];

    const sequence = buildAppointmentPackageSequenceMap(appointments);

    expect(getAppointmentPackageApplicationLabel(appointments[0], sequence.get('apt-old'))).toBe('Aplicação 1/2');
    expect(getAppointmentPackageApplicationLabel(appointments[1], sequence.get('apt-next'))).toBe('Aplicação 2/2');
  });

  it('numera séries recorrentes pela data real mesmo quando as anotações estão fora de ordem', () => {
    const appointments = [
      { id: 'apt-6', recurring_group_id: 'rec', status: 'completed', start_time: '2026-05-29T13:00:00', created_at: '2026-01-01T00:00:06', notes: 'Sessão 6 de 10' },
      { id: 'apt-5', recurring_group_id: 'rec', status: 'completed', start_time: '2026-06-19T13:00:00', created_at: '2026-01-01T00:00:05', notes: 'Sessão 5 de 10' },
      { id: 'apt-1', recurring_group_id: 'rec', status: 'completed', start_time: '2026-02-06T13:00:00', created_at: '2026-01-01T00:00:01', notes: 'Sessão 1 de 10' },
    ] as any[];

    const sequence = buildAppointmentRecurringSequenceMap(appointments);

    expect(getAppointmentRecurringSessionLabel(sequence.get('apt-6'))).toBe('Sessão 2 de 3');
    expect(getAppointmentRecurringSessionLabel(sequence.get('apt-5'))).toBe('Sessão 3 de 3');
    expect(formatAppointmentNotesWithRecurringSequence(appointments[0].notes, sequence.get('apt-6'))).toBe('Sessão 2 de 3');
  });
});