import { describe, it, expect } from 'vitest';
import { mustClearOnIdentity } from '../queryPersistence';

describe('cache local por usuário', () => {
  it('mantém o cache restaurado do mesmo usuário ao reabrir', () => {
    expect(mustClearOnIdentity(null, 'u1', 'u1')).toBe(false);
  });
  it('apaga o cache quando outro usuário entra', () => {
    expect(mustClearOnIdentity(null, 'u2', 'u1')).toBe(true);
    expect(mustClearOnIdentity('u1', 'u2', 'u1')).toBe(true);
  });
  it('apaga o cache ao sair', () => {
    expect(mustClearOnIdentity('u1', null, 'u1')).toBe(true);
  });
});
