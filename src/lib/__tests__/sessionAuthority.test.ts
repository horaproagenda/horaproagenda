import { describe, expect, it } from 'vitest';
import { isCurrentSessionResponse, sessionIdentityChanged } from '../sessionAuthority';

describe('autoridade da sessão', () => {
  it('trocar de usuário descarta o cache da conta anterior', () => {
    expect(sessionIdentityChanged('conta-a', 'conta-b')).toBe(true);
  });
  it('logout descarta os dados da conta', () => {
    expect(sessionIdentityChanged('conta-a', null)).toBe(true);
  });
  it('renovar a sessão do mesmo usuário não limpa os dados', () => {
    expect(sessionIdentityChanged('conta-a', 'conta-a')).toBe(false);
  });
  it('resposta da conta anterior não vale para o usuário atual', () => {
    expect(isCurrentSessionResponse('conta-a', 'conta-b')).toBe(false);
  });
  it('resposta depois do logout não restaura o perfil', () => {
    expect(isCurrentSessionResponse('conta-a', null)).toBe(false);
  });
  it('resposta da sessão atual é aceita', () => {
    expect(isCurrentSessionResponse('conta-a', 'conta-a')).toBe(true);
  });
});