import { test, expect } from '@playwright/test';
import {
  tokenizeDocumentLine,
  buildFilledDocumentContent,
  extractDocumentPrefillSnapshot,
  normalizeDocumentLinkPayload,
} from '../src/lib/documentTemplateFields';
import {
  calculateEstimatedUsagePerAppointment,
  calculateRemainingAppointments,
  calculateUnitPrice,
  calculateTotalPrice,
  convertQuantity,
} from '../src/lib/productStock';

test('normaliza payload público de documento em objeto', () => {
  expect(normalizeDocumentLinkPayload({ id: '1' })).toEqual({ id: '1' });
  expect(normalizeDocumentLinkPayload([{ id: '1' }])).toEqual({ id: '1' });
  expect(normalizeDocumentLinkPayload(null)).toBeNull();
});

test('extrai snapshot de preenchimento do link', () => {
  const snapshot = extractDocumentPrefillSnapshot({
    __prefill: {
      client: { id: 'c1', name: 'Maria', cpf: '123', birthdate: '1990-01-01', phone: '9999' },
      professional: { id: 'p1', name: 'Ana' },
      formData: { nome: 'Maria', cpf: '123', profissional: 'Ana' },
    },
  });

  expect(snapshot.client?.name).toBe('Maria');
  expect(snapshot.professional?.name).toBe('Ana');
  expect(snapshot.formData?.nome).toBe('Maria');
});

test('mantém campos interativos inline e na ordem correta', () => {
  const tokens = tokenizeDocumentLine('Possui alergia? ( ) Sim ( ) Não [TEXTO_LIVRE]', 0);
  expect(tokens.map(token => token.type)).toEqual(['text', 'yesno', 'text', 'freeText']);
});

test('monta conteúdo preenchido preservando respostas por linha', () => {
  const content = buildFilledDocumentContent({
    content: 'Nome: {nome}\nPossui alergia? ( ) Sim ( ) Não\nObservações: [TEXTO_LIVRE]',
    formData: { nome: 'Maria' },
    yesNoAnswers: { question_1: 'sim' },
    additionalInfo: { texto_livre_2_0: 'Nenhuma' },
  });

  expect(content).toContain('Nome: Maria');
  expect(content).toContain('Possui alergia? (X) Sim ( ) Não');
  expect(content).toContain('Observações: Nenhuma');
});

test('converte unidades compatíveis para estoque e recipiente', () => {
  expect(convertQuantity(1, 'l', 'ml')).toBe(1000);
  expect(convertQuantity(500, 'ml', 'l')).toBeCloseTo(0.5);
  expect(convertQuantity(1, 'kg', 'g')).toBe(1000);
});

test('calcula preço unitário e total sem divergência', () => {
  expect(calculateUnitPrice(10, 100)).toBe(10);
  expect(calculateTotalPrice(10, 10)).toBe(100);
});

test('calcula consumo estimado por atendimento e atendimentos restantes', () => {
  expect(calculateEstimatedUsagePerAppointment({
    containerAmount: 100,
    containerUnit: 'ml',
    stockUnit: 'l',
    estimatedAppointments: 20,
  })).toBeCloseTo(0.005);

  expect(calculateRemainingAppointments({
    currentStock: 5,
    stockUnit: 'l',
    trackingMethod: 'estimated',
    containerAmount: 100,
    containerUnit: 'ml',
    estimatedAppointments: 20,
  })).toBe(1000);
});

test('permite deixar atendimentos estimados zerados sem quebrar o cálculo', () => {
  expect(calculateRemainingAppointments({
    currentStock: 5,
    stockUnit: 'l',
    trackingMethod: 'estimated',
    containerAmount: 100,
    containerUnit: 'ml',
    estimatedAppointments: 0,
  })).toBeNull();
});
