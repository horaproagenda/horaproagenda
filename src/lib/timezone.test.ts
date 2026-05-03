import { describe, it, expect } from 'vitest';
import { createDateTimeInTimeZone, formatTimeInTimeZone, formatDateInTimeZone } from './timezone';

describe('timezone helpers', () => {
  it('cria data com hora exata no fuso configurado', () => {
    const date = new Date('2026-06-10T12:00:00');
    const dt = createDateTimeInTimeZone(date, '14:30', 'America/Sao_Paulo');
    expect(formatTimeInTimeZone(dt, 'America/Sao_Paulo')).toBe('14:30');
  });

  it('mantém data correta sem deslocamento de dia', () => {
    const date = new Date('2026-06-10T12:00:00');
    const dt = createDateTimeInTimeZone(date, '00:30', 'America/Sao_Paulo');
    expect(formatDateInTimeZone(dt, 'America/Sao_Paulo')).toBe('2026-06-10');
  });

  it('formatTimeInTimeZone aceita string ISO', () => {
    expect(formatTimeInTimeZone('2026-06-10T17:00:00Z', 'America/Sao_Paulo')).toBe('14:00');
  });
});
