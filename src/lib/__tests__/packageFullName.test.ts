import { describe, it, expect } from 'vitest';
import {
  isCommonPackageAppointment,
  resolveAppointmentPackageName,
  resolveAppointmentStepServiceName,
  formatAppointmentServiceWithPackageContext,
} from '../packageStepLabel';

const commonPackage = {
  service_name_snapshot: 'Canela',
  package_name_snapshot: 'Virilha + Coxa + canela 5 apli',
  notes: 'Serviço da etapa não encontrado — Virilha + Coxa + canela 5 apli',
  package_appointment: {
    package: { name: 'Virilha + Coxa + canela 5 apli', package_type: 'standard' },
  },
};

const sequentialPackage = {
  service_name_snapshot: 'Avaliação',
  package_name_snapshot: 'Corpo inteiro',
  package_appointment: { package: { name: 'Corpo inteiro', package_type: 'sequential' } },
};

describe('nome do pacote nos registros', () => {
  it('pacote comum exibe o nome completo do pacote, como cadastrado', () => {
    expect(isCommonPackageAppointment(commonPackage)).toBe(true);
    expect(resolveAppointmentStepServiceName(commonPackage)).toBe('Virilha + Coxa + canela 5 apli');
  });

  it('nunca repete o nome do pacote no rótulo com contexto', () => {
    expect(formatAppointmentServiceWithPackageContext(commonPackage)).toBe('Virilha + Coxa + canela 5 apli');
  });

  it('pacote sequencial mantém o serviço da etapa e o pacote como contexto', () => {
    expect(isCommonPackageAppointment(sequentialPackage)).toBe(false);
    expect(resolveAppointmentStepServiceName(sequentialPackage)).toBe('Avaliação');
    expect(formatAppointmentServiceWithPackageContext(sequentialPackage)).toBe('Avaliação (Corpo inteiro)');
  });

  it('nome completo é preservado sem cortes', () => {
    expect(resolveAppointmentPackageName(commonPackage)).toBe('Virilha + Coxa + canela 5 apli');
  });

  it('etapa sem serviço identificado cai para o nome do pacote', () => {
    expect(
      resolveAppointmentStepServiceName({
        package_name_snapshot: 'Axila + virilha completa',
        package_appointment: { package: { name: 'Axila + virilha completa', package_type: 'sequential' } },
      })
    ).toBe('Axila + virilha completa');
  });
});
