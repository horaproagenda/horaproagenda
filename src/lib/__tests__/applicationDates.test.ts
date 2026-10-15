import { describe, expect, it } from 'vitest';
import { applicationDateLabel, applicationLocalInput, isApplicationLocalDate } from '../applicationDates';

describe('datas das fichas', () => {
  it('não interrompe o formulário por horário histórico inválido', () => {
    expect(applicationDateLabel('15:00:00')).toBe('Data indisponível');
    expect(applicationLocalInput('')).toBe('');
  });
  it('mantém data e hora no fuso da clínica', () => {
    expect(applicationLocalInput('2026-10-15T18:24:00Z')).toBe('2026-10-15T15:24');
    expect(applicationDateLabel('2026-10-15T18:24:00Z')).toBe('15/10/2026 15:24');
  });
  it('recusa datas vazias ou impossíveis antes de salvar', () => {
    expect(isApplicationLocalDate('')).toBe(false);
    expect(isApplicationLocalDate('2026-02-30T15:24')).toBe(false);
    expect(isApplicationLocalDate('2026-10-15T15:24')).toBe(true);
  });
});