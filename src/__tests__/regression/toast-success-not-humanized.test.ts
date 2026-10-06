import { describe, it, expect } from 'vitest';
import { humanizeToastMessage } from '@/lib/humanError';

describe('avisos de sucesso não viram erro genérico', () => {
  it('preserva mensagens de kit', () => {
    expect(humanizeToastMessage('Kit agendado: 3 atendimento(s) criados.')).toBe('Kit agendado: 3 atendimento(s) criados.');
    expect(humanizeToastMessage('Kit atualizado: 2 atendimento(s) reagendados.')).toBe('Kit atualizado: 2 atendimento(s) reagendados.');
  });
  it('continua traduzindo erros técnicos', () => {
    const r = String(humanizeToastMessage('Erro ao salvar: duplicate key value violates unique constraint "clients_name_key"'));
    expect(r).not.toMatch(/duplicate key/);
  });
});
