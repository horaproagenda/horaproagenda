import { describe, it, expect } from 'vitest';
import { getAppointmentDisplayDurationMinutes } from '../appointmentDisplayDuration';

describe('getAppointmentDisplayDurationMinutes', () => {
  it('usa (end - start) como fonte da verdade', () => {
    const apt = {
      start_time: '2026-07-21T10:00:00Z',
      end_time: '2026-07-21T11:00:00Z',
      service: { duration: 760 }, // valor agregado errado — deve ser ignorado
    };
    expect(getAppointmentDisplayDurationMinutes(apt)).toBe(60);
  });

  it('cai para service.duration quando end_time faltar, ignorando valor agregado', () => {
    expect(getAppointmentDisplayDurationMinutes({ service: { duration: 45 } } as any)).toBe(45);
    expect(getAppointmentDisplayDurationMinutes({ service: { duration: 760 } } as any, 30)).toBe(30);
  });

  it('retorna fallback quando nada é válido', () => {
    expect(getAppointmentDisplayDurationMinutes(null, 30)).toBe(30);
    expect(getAppointmentDisplayDurationMinutes({} as any, 30)).toBe(30);
  });
});
