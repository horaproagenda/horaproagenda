import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('cadastro interno de clientes usa as regras únicas', () => {
  it('NewClientDialog valida com validateClientInput', () => {
    const src = readFileSync('src/components/clients/NewClientDialog.tsx', 'utf8');
    expect(src).toContain('validateClientInput(data)');
    expect(src).not.toContain('isValidCPF(val)');
  });
});
