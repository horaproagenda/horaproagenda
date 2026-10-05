import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeFirstSteps } from '@/lib/firstStepsProgress';

const created = '2026-10-01T12:00:00Z';
const seeded = { created_at: '2026-10-01T12:00:02Z', updated_at: '2026-10-01T12:00:02Z' };

describe('Primeiros passos: conta nova começa com 0 de 5', () => {
  it('itens que vêm prontos não marcam passos', () => {
    const r = computeFirstSteps({
      accountCreatedAt: created,
      settings: { opening_time: '08:00:00', closing_time: '20:00:00', created_at: created, updated_at: created },
      prefs: [],
      services: 0,
      clients: 0,
      paymentMethods: Array(9).fill(seeded),
      documents: [seeded],
    });
    expect(Object.values(r).filter(Boolean)).toHaveLength(0);
  });

  it('marca o que a pessoa fez de verdade', () => {
    const r = computeFirstSteps({
      accountCreatedAt: created,
      settings: null,
      prefs: [{ opening_time: '09:00:00', closing_time: '19:00:00' }],
      services: 1,
      clients: 2,
      resources: 1,
      paymentMethods: [{ created_at: seeded.created_at, updated_at: '2026-10-02T10:00:00Z' }],
      documents: [{ created_at: '2026-10-03T10:00:00Z', updated_at: '2026-10-03T10:00:00Z' }],
    });
    expect(Object.values(r).every(Boolean)).toBe(true);
  });

  it('pular a configuração inicial não marca horários', () => {
    const src = readFileSync('src/lib/firstStepsProgress.ts', 'utf8');
    expect(src).not.toContain('onboarding_completed_at');
  });
});

describe('Primeiros passos: sem vazamento de outras contas', () => {
  it('modelos padrão do cadastro não marcam documentos, mesmo criados depois', () => {
    const late = { created_at: '2026-10-01T13:00:00Z', updated_at: '2026-10-01T13:00:00Z' };
    const r = computeFirstSteps({
      accountCreatedAt: created,
      settings: null, prefs: [], services: 0, clients: 0, paymentMethods: [],
      documents: [
        { ...late, title: 'Anamnese básica' },
        { ...late, title: 'Termo de consentimento' },
        { ...late, title: 'Contrato de prestação de serviços' },
      ],
    });
    expect(r.documents).toBe(false);
  });

  it('modelo padrão editado conta', () => {
    const r = computeFirstSteps({
      accountCreatedAt: created, settings: null, prefs: [], services: 0, clients: 0, paymentMethods: [],
      documents: [{ title: 'Anamnese básica', created_at: created, updated_at: '2026-10-02T10:00:00Z' }],
    });
    expect(r.documents).toBe(true);
  });

  it('o guia sempre filtra pela conta e não usa a chamada que falha', () => {
    const src = readFileSync('src/components/onboarding/FirstStepsCard.tsx', 'utf8');
    expect(src).not.toContain("rpc('current_account_owner_id')");
    expect(src).not.toMatch(/owner \? q\.eq/);
    expect(src).toContain("q.eq('account_owner_id', ownerId)");
  });
});

describe('Primeiros passos: ordem e páginas certas', () => {
  it('6 passos na ordem pedida, cada um abrindo a página correta', () => {
    const src = readFileSync('src/components/onboarding/FirstStepsCard.tsx', 'utf8');
    const order = [
      ["'hours'", "'/configuracoes'"],
      ["'resources'", "'/cadastros'"],
      ["'services'", "'/servicos'"],
      ["'payments'", "'/financeiro?tab=formas'"],
      ["'documents'", "'/documentos'"],
      ["'clients'", "'/clientes'"],
    ];
    let last = -1;
    for (const [key, path] of order) {
      const line = src.split('\n').find((l) => l.includes(`key: ${key}`))!;
      expect(line).toContain(`path: ${path}`);
      const idx = src.indexOf(`key: ${key}`);
      expect(idx).toBeGreaterThan(last);
      last = idx;
    }
  });
});
