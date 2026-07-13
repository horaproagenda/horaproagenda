import { describe, expect, it } from 'vitest';
import { formatDurationClock, parseDurationClock, addMinutesToClock } from './duration';

describe('manual HH:mm duration input', () => {
  it('formata minutos como HH:mm para serviços, pacotes, edição e relatórios', () => {
    expect(formatDurationClock(5)).toBe('00:05');
    expect(formatDurationClock(60)).toBe('01:00');
    expect(formatDurationClock(135)).toBe('02:15');
  });

  it('interpreta HH:mm como minutos antes de salvar', () => {
    expect(parseDurationClock('00:05')).toBe(5);
    expect(parseDurationClock('01:30')).toBe(90);
    expect(parseDurationClock('08:00')).toBe(480);
  });

  it('rejeita horários inválidos que não podem virar minutos', () => {
    expect(parseDurationClock('01:60')).toBeNull();
    expect(parseDurationClock('1h30')).toBeNull();
    expect(parseDurationClock('')).toBeNull();
  });
});