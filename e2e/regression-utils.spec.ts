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
import { mergeAgendaTimeSlots } from '../src/lib/agendaSlots';
import {
  getAppointmentPackageApplicationLabel,
  isPackageSessionRealized,
  sortPackageSessionsByPreservedSequence,
} from '../src/lib/packageSequence';

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

test('protege a agenda para nunca ocultar agendamentos fora do intervalo configurado', () => {
  const slots = mergeAgendaTimeSlots({
    baseSlots: ['08:00', '08:30', '09:00'],
    appointments: [
      { id: 'apt-1', start_time: '2026-04-27T18:50:00', status: 'scheduled' } as any,
      { id: 'apt-2', start_time: '2026-04-27T07:10:00', status: 'scheduled' } as any,
      { id: 'apt-3', start_time: '2026-04-27T19:30:00', status: 'rescheduled' } as any,
    ],
    absences: [],
    viewType: 'week',
    selectedDate: new Date('2026-04-27T12:00:00'),
    weekStart: new Date('2026-04-27T12:00:00'),
    monthStart: new Date('2026-04-01T12:00:00'),
    hideSunday: false,
  });

  expect(slots).toContain('18:50');
  expect(slots).toContain('07:10');
  expect(slots).not.toContain('19:30');
});

test('inclui agendamentos e ausências que atravessam o dia na grade visível', () => {
  const slots = mergeAgendaTimeSlots({
    baseSlots: ['08:00', '08:30', '09:00'],
    appointments: [
      { id: 'apt-overnight', start_time: '2026-04-26T23:40:00', end_time: '2026-04-27T00:40:00', status: 'scheduled' } as any,
    ],
    absences: [
      { start_time: '2026-04-27T22:15:00', end_time: '2026-04-28T01:00:00' },
    ],
    viewType: 'day',
    selectedDate: new Date('2026-04-27T12:00:00'),
    weekStart: new Date('2026-04-27T12:00:00'),
    monthStart: new Date('2026-04-01T12:00:00'),
    hideSunday: false,
  });

  expect(slots).toContain('00:00');
  expect(slots).toContain('22:15');
});

test('preserva número original do pacote após cancelamento e reagendamento', () => {
  const history = [
    { id: 'session-2', session_number: 2, original_session_number: 2, status: 'cancelled', created_at: '2026-04-01T10:00:00' },
    { id: 'session-1', session_number: 1, original_session_number: 1, status: 'completed', created_at: '2026-04-01T09:00:00' },
    { id: 'session-3', session_number: 3, original_session_number: 3, status: 'scheduled', created_at: '2026-04-01T11:00:00' },
  ] as any[];

  const ordered = sortPackageSessionsByPreservedSequence(history);
  expect(ordered.map(item => item.id)).toEqual(['session-1', 'session-2', 'session-3']);
  expect(getAppointmentPackageApplicationLabel({
    package_appointment: {
      session_number: 9,
      original_session_number: 2,
      package: { total_sessions: 5 },
    },
  } as any)).toBe('Aplicação 2/5');
});

test('considera falta como aplicação realizada do pacote', () => {
  expect(isPackageSessionRealized('completed')).toBe(true);
  expect(isPackageSessionRealized('missed')).toBe(true);
  expect(isPackageSessionRealized('cancelled')).toBe(false);
  expect(isPackageSessionRealized('rescheduled')).toBe(false);
});
