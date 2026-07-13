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

describe('addMinutesToClock — término calculado no relógio de parede', () => {
  it('soma minutos preservando o formato HH:mm 24h (sem timezone)', () => {
    expect(addMinutesToClock('08:00', 40)).toBe('08:40');
    expect(addMinutesToClock('13:00', 40)).toBe('13:40');
    expect(addMinutesToClock('09:30', 90)).toBe('11:00');
    expect(addMinutesToClock('23:30', 45)).toBe('00:15');
  });

  it('retorna vazio para horários inválidos', () => {
    expect(addMinutesToClock('', 30)).toBe('');
    expect(addMinutesToClock('ab:cd', 30)).toBe('');
  });
});