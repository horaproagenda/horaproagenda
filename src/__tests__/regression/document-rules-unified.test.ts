import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { inferDocumentType } from '@/lib/documentRules';

describe('regras únicas de documentos', () => {
  it('cópia do servidor é idêntica', () => {
    expect(readFileSync('supabase/functions/_shared/documentRules.ts', 'utf8')).toBe(readFileSync('src/lib/documentRules.ts', 'utf8'));
  });
  it('categoria do modelo vence o título', () => {
    expect(inferDocumentType('consent', 'Contrato X')).toBe('consent');
  });
  it('termo pelo título vira consentimento (antes o link público gravava "outro")', () => {
    expect(inferDocumentType(null, 'Termo de uso de imagem')).toBe('consent');
  });
  it('anamnese e contrato pelo título', () => {
    expect(inferDocumentType(undefined, 'Ficha de Anamnese')).toBe('anamnese');
    expect(inferDocumentType(undefined, 'Contrato de serviço')).toBe('contract');
  });
});
