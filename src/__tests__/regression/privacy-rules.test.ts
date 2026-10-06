import { describe, it, expect } from 'vitest';
import { canSeeRecord, blankRow, PERMISSION_MODULES } from '@/lib/permissions';

const rows = PERMISSION_MODULES.map(m => blankRow(m.key));
const base = { rows, module: 'documentos' as const, myProfessionalId: 'me' };

describe('regras de privacidade', () => {
  it('privado: só o dono vê, nem o administrador', () => {
    expect(canSeeRecord({ ...base, ownerProfessionalId: 'me', visibility: 'private' })).toBe(true);
    expect(canSeeRecord({ ...base, ownerProfessionalId: 'x', visibility: 'private', isAdmin: true })).toBe(false);
  });
  it('geral da clínica: todos veem', () => {
    expect(canSeeRecord({ ...base, ownerProfessionalId: 'x', visibility: 'clinic' })).toBe(true);
  });
  it('compartilhado: admin vê, profissional sem permissão não', () => {
    expect(canSeeRecord({ ...base, ownerProfessionalId: 'x', visibility: 'shared', isAdmin: true })).toBe(true);
    expect(canSeeRecord({ ...base, ownerProfessionalId: 'x', visibility: 'shared' })).toBe(false);
  });
});
