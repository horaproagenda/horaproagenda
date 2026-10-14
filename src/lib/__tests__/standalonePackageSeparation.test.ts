import { describe, expect, it } from 'vitest';
import { buildAppointmentPackageSequenceMap, getPackageApplicationLabel } from '../packageSequence';
import type { Appointment, PackageAppointment } from '@/types';
describe('avulso independente de pacote posterior', () => {
 it('anotação de pacote não cria etapa no avulso', () => {
  expect(getPackageApplicationLabel(null, 15, null, 'Corpo inteiro - Aplicação 1/15')).toBe('-');
 });
 it('avulso anterior não consome o número 1 do pacote', () => {
  const items = [
   { id: 'avulso', start_time: '2026-08-19T21:00:00Z', notes: 'Corpo inteiro', package_appointment: null },
   { id: 'pacote', start_time: '2026-09-02T21:00:00Z', package_appointment: { id: 'etapa', package_id: 'novo', session_number: 2 } },
  ] as Appointment[];
  const sequence = buildAppointmentPackageSequenceMap(items);
  expect(sequence.has('avulso')).toBe(false);
  expect(sequence.get('pacote')).toBe(1);
 });
 it('número exibido 1 não modifica identidade original 2 do procedimento', () => {
  const session = { id: 'etapa', display_session_number: 1, original_session_number: 2, session_number: 2 } as PackageAppointment;
  expect(getPackageApplicationLabel(session, 15, 2)).toBe('Aplicação 1/15');
  expect(session.original_session_number).toBe(2);
 });
});