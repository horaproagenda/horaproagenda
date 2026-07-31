import { describe, it, expect } from 'vitest';
import { readEdgeFunctionError, edgeErrorMessage, isEmailExistsCode } from '../edgeFunctionError';

const makeError = (body: unknown) => {
  const err = new Error('Edge Function returned a non-2xx status code') as Error & { context?: unknown };
  err.context = { json: async () => body };
  return err;
};

describe('edgeFunctionError', () => {
  it('extrai o payload JSON do erro da edge function', async () => {
    const payload = await readEdgeFunctionError(
      makeError({ error: 'Este e-mail já está cadastrado.', code: 'email_already_registered' }),
    );
    expect(payload?.code).toBe('email_already_registered');
  });

  it('mostra a mensagem real em vez de "non-2xx"', async () => {
    const msg = await edgeErrorMessage(makeError({ error: 'Aguarde 60 segundos antes de solicitar um novo código.' }));
    expect(msg).toBe('Aguarde 60 segundos antes de solicitar um novo código.');
  });

  it('usa o fallback quando não há corpo legível', async () => {
    const err = new Error('Edge Function returned a non-2xx status code');
    expect(await edgeErrorMessage(err, 'Erro ao enviar código')).toBe('Erro ao enviar código');
  });

  it('reconhece todos os códigos de e-mail já cadastrado', () => {
    expect(isEmailExistsCode('email_exists')).toBe(true);
    expect(isEmailExistsCode('email_already_registered')).toBe(true);
    expect(isEmailExistsCode('outro')).toBe(false);
  });
});
