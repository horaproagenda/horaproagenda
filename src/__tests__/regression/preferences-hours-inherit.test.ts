import { describe, it, expect } from 'vitest';
import { resolveHourOverride } from '@/components/settings/MinhasPreferenciasSettings';

describe('Minhas preferências: horário pré-preenchido continua herdado', () => {
  it('não grava o horário geral como próprio quando não havia horário próprio', () => {
    expect(resolveHourOverride('08:00', null, '08:00:00')).toBeNull();
  });
  it('grava quando o usuário muda o horário', () => {
    expect(resolveHourOverride('09:00', null, '08:00:00')).toBe('09:00:00');
  });
  it('mantém horário próprio já existente, mesmo igual ao geral', () => {
    expect(resolveHourOverride('08:00', '08:00:00', '08:00:00')).toBe('08:00:00');
  });
  it('campo vazio herda', () => {
    expect(resolveHourOverride('', '08:00:00', '08:00:00')).toBeNull();
  });
});
