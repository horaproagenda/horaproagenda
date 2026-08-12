import { describe, expect, it } from 'vitest';
import { explainPasswordUpdateError, validateNewPassword } from '@/lib/passwordPolicy';

const VALID = 'Minha@Senha1';

describe('validateNewPassword', () => {
  it('rejeita senha curta', () => {
    expect(validateNewPassword('Ab1!x', 'Ab1!x')).toMatch(/8 caracteres/);
  });

  it('rejeita senha sem maiúscula', () => {
    expect(validateNewPassword('minha@senha1', 'minha@senha1')).toMatch(/maiúscula/);
  });

  it('rejeita senha sem minúscula', () => {
    expect(validateNewPassword('MINHA@SENHA1', 'MINHA@SENHA1')).toMatch(/minúscula/);
  });

  it('rejeita senha sem número', () => {
    expect(validateNewPassword('Minha@Senha', 'Minha@Senha')).toMatch(/número/);
  });

  it('rejeita senha sem símbolo', () => {
    expect(validateNewPassword('MinhaSenha1', 'MinhaSenha1')).toMatch(/símbolo/);
  });

  it('rejeita senha com espaços', () => {
    expect(validateNewPassword('Minha @Senha1', 'Minha @Senha1')).toMatch(/espaços/);
  });

  it('rejeita confirmação diferente', () => {
    expect(validateNewPassword(VALID, 'Outra@Senha1')).toMatch(/não são iguais/);
  });

  it('aceita senha dentro da política', () => {
    expect(validateNewPassword(VALID, VALID)).toBeNull();
  });

  it('valida sem confirmação quando ela não é informada', () => {
    expect(validateNewPassword(VALID)).toBeNull();
  });
});

describe('explainPasswordUpdateError', () => {
  it('explica senha repetida', () => {
    expect(explainPasswordUpdateError({ code: 'same_password' })).toMatch(/diferente da senha atual/);
  });

  it('explica requisitos de caracteres do servidor', () => {
    expect(
      explainPasswordUpdateError({
        message: 'Password should contain at least one character of each: abc, ABC, 123',
      }),
    ).toMatch(/requisitos de segurança/);
  });

  it('explica senha vazada/fraca', () => {
    expect(explainPasswordUpdateError({ message: 'Password is known to be weak and easy to guess' }))
      .toMatch(/fraca ou já apareceu/);
  });

  it('explica senha curta reportada pelo servidor', () => {
    expect(explainPasswordUpdateError({ message: 'Password should be at least 6 characters.' }))
      .toMatch(/curta demais/);
  });

  it('explica usuário inexistente', () => {
    expect(explainPasswordUpdateError({ message: 'User not found' })).toMatch(/não possui cadastro/);
  });

  it('explica limite de tentativas', () => {
    expect(explainPasswordUpdateError({ status: 429 })).toMatch(/Aguarde alguns minutos/);
  });

  it('explica falha de rede', () => {
    expect(explainPasswordUpdateError({ message: 'Failed to fetch' })).toMatch(/conexão com a internet/);
  });

  it('usa mensagem genérica clara como último recurso', () => {
    expect(explainPasswordUpdateError({ message: 'boom' })).toMatch(/fale com o suporte/);
  });
});
