import { describe, it, expect } from 'vitest';
import { humanizeError, humanizeToastMessage } from '../humanError';

describe('humanizeError', () => {
  it('explica violação de chave única sem citar constraint', () => {
    const msg = humanizeError('duplicate key value violates unique constraint "clients_name_key"');
    expect(msg).toContain('Já existe um cliente cadastrado com esse nome');
    expect(msg).not.toMatch(/constraint|duplicate/i);
  });

  it('explica campo obrigatório em branco', () => {
    expect(humanizeError('null value in column "token" violates not-null constraint')).toContain(
      'token de conexão',
    );
  });

  it('explica falta de permissão (RLS)', () => {
    expect(humanizeError({ code: '42501', message: 'permission denied for table clients' })).toContain(
      'não tem permissão',
    );
  });

  it('explica erro de edge function sem "non-2xx"', () => {
    const msg = humanizeError('Edge Function returned a non-2xx status code');
    expect(msg).not.toMatch(/non-2xx/i);
    expect(msg).toContain('servidor');
  });

  it('explica falha de rede', () => {
    expect(humanizeError(new TypeError('Failed to fetch'))).toContain('conexão');
  });

  it('traduz códigos HTTP', () => {
    expect(humanizeError({ status: 429 })).toContain('Muitas tentativas');
    expect(humanizeError({ status: 500 })).toContain('servidor');
  });

  it('preserva mensagens de regra do sistema em português', () => {
    const msg = humanizeError({ code: 'P0001', message: 'Horário indisponível para este profissional.' });
    expect(msg).toBe('Horário indisponível para este profissional.');
  });

  it('nunca devolve códigos crus', () => {
    const msg = humanizeError({ code: 'XX999', message: 'internal error 0x8007' });
    expect(msg).not.toMatch(/XX999|0x8007/);
    expect(msg.length).toBeGreaterThan(20);
  });
});

describe('humanizeToastMessage', () => {
  it('mantém o contexto e humaniza a parte técnica', () => {
    const out = humanizeToastMessage(
      'Erro ao criar categoria: duplicate key value violates unique constraint "uq_financial_categories_name_type"',
    ) as string;
    expect(out.startsWith('Erro ao criar categoria:')).toBe(true);
    expect(out).toContain('categoria financeira');
  });

  it('não altera mensagens já claras', () => {
    expect(humanizeToastMessage('Cliente salvo com sucesso')).toBe('Cliente salvo com sucesso');
  });
});
