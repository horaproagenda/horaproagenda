import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateClientInput, normalizeClientInput } from '@/lib/clientRules';
import { filterImportBatch } from '@/lib/clientImport';

describe('regras únicas de cadastro de clientes', () => {
  it('cópia do servidor é idêntica à do app', () => {
    expect(readFileSync('supabase/functions/_shared/clientRules.ts', 'utf8'))
      .toBe(readFileSync('src/lib/clientRules.ts', 'utf8'));
  });
  it('as duas funções do servidor usam as regras compartilhadas', () => {
    for (const f of ['create-client', 'submit-client-registration']) {
      const src = readFileSync(`supabase/functions/${f}/index.ts`, 'utf8');
      expect(src).toContain('validateClientInput');
      expect(src).not.toMatch(/function validateCPF/);
    }
  });
  it('link público exige CPF válido', () => {
    expect(validateClientInput({ name: 'Ana', phone: '11999998888' }, { requireDocument: true })[0].field).toBe('cpf');
    expect(validateClientInput({ name: 'Ana', phone: '11999998888', cpf: '529.982.247-25' }, { requireDocument: true })).toEqual([]);
  });
  it('telefone com menos de 10 dígitos é recusado', () => {
    expect(validateClientInput({ name: 'Ana', phone: '999' })[0].field).toBe('phone');
  });
  it('normaliza telefone, CPF e UF', () => {
    const r = normalizeClientInput({ name: ' Ana ', phone: '(11) 99999-8888', cpf: '529.982.247-25', address_state: 'sp' });
    expect([r.name, r.phone, r.cpf, r.address_state]).toEqual(['Ana', '11999998888', '52998224725', 'SP']);
  });
  it('importação ignora duplicados no arquivo e já cadastrados', () => {
    const { clientsToInsert, skipped } = filterImportBatch(
      [{ name: 'A', phone: '11999998888' }, { name: 'B', phone: '(11) 99999-8888' }, { name: 'C', phone: '11911112222' }],
      { phones: new Set(['11911112222']), cpfs: new Set() },
    );
    expect(clientsToInsert.map((c) => c.name)).toEqual(['A']);
    expect(skipped).toHaveLength(2);
  });
});
