// Resolve o rótulo do serviço a ser exibido em cada linha da
// "Visualização das Sessões" para pacote sequencial, kits ou pacote comum.
// Regra: nunca exibir só o nome do pacote — sempre priorizar o nome do
// serviço da etapa; se não houver, cair para o serviço geral do pacote,
// depois para a próxima etapa conhecida e por fim para "Sessão N · <pacote>".

export interface StepLike {
  service_id?: string | null;
}

export interface ServiceLike {
  id: string;
  name: string;
}

export interface PackageLike {
  name?: string | null;
  service_id?: string | null;
}

export interface ResolveArgs {
  index: number;
  steps: StepLike[];
  services: ServiceLike[];
  pkg: PackageLike | null;
  nextStepService?: ServiceLike | null;
  fallbackService?: ServiceLike | null;
}

export const MISSING_STEP_SERVICE_LABEL = 'Serviço da etapa não encontrado';

const cleanLabel = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

export function resolveSessionServiceLabel({
  index,
  steps,
  services,
  pkg,
  nextStepService,
  fallbackService,
}: ResolveArgs): string {
  const stepId = steps[index]?.service_id;
  const step = stepId ? services.find((s) => s.id === stepId) : null;
  if (step?.name) return step.name;

  const pkgSvcId = pkg?.service_id;
  const pkgSvc = pkgSvcId ? services.find((s) => s.id === pkgSvcId) : null;
  if (pkgSvc?.name) return pkgSvc.name;

  if (nextStepService?.name) return nextStepService.name;
  if (fallbackService?.name) return fallbackService.name;

  return MISSING_STEP_SERVICE_LABEL;
}

export type AppointmentServiceLabelSource = {
  service?: { name?: string | null } | null;
  service_name_snapshot?: string | null;
  package_name_snapshot?: string | null;
  notes?: string | null;
  package_appointment?: {
    package?: { name?: string | null; package_type?: string | null } | null;
  } | null;
};

const extractPackageNameFromNotes = (notes?: string | null) => (
  notes?.match(/^(.+?)\s*-\s*Sessão\s+\d+\s+de\s+\d+/i)?.[1]?.trim() || null
);

export const isPackageAppointmentLike = (appointment?: AppointmentServiceLabelSource | null) => {
  if (!appointment) return false;
  return Boolean(
    appointment.package_appointment ||
    cleanLabel(appointment.package_name_snapshot) ||
    cleanLabel(extractPackageNameFromNotes(appointment.notes)),
  );
};

/**
 * Pacote comum (standard): todas as sessões são do mesmo procedimento, então o
 * rótulo correto em qualquer tela é o NOME COMPLETO do pacote, exatamente como
 * foi cadastrado. Pacote sequencial e kit mantêm o nome do serviço da etapa.
 */
export const isCommonPackageAppointment = (appointment?: AppointmentServiceLabelSource | null) => {
  if (!isPackageAppointmentLike(appointment)) return false;
  const type = cleanLabel(appointment?.package_appointment?.package?.package_type);
  if (!type) return false;
  return type !== 'sequential' && type !== 'kit' && type !== 'composite';
};

export const resolveAppointmentStepServiceName = (
  appointment?: AppointmentServiceLabelSource | null,
  fallback = 'Serviço',
) => {
  if (!appointment) return fallback;
  const isPackage = isPackageAppointmentLike(appointment);
  const snapshotName = cleanLabel(appointment.service_name_snapshot);
  const currentServiceName = cleanLabel(appointment.service?.name);

  if (isPackage) {
    const packageName = resolveAppointmentPackageName(appointment, '');
    // Pacote comum: sempre o nome completo do pacote.
    if (isCommonPackageAppointment(appointment) && packageName) return packageName;
    // Etapa sem serviço identificado: melhor mostrar o pacote do que "não encontrado".
    return snapshotName || currentServiceName || packageName || MISSING_STEP_SERVICE_LABEL;
  }

  return currentServiceName || snapshotName || fallback;
};

export const resolveAppointmentPackageName = (
  appointment?: AppointmentServiceLabelSource | null,
  fallback = 'Pacote',
) => {
  if (!appointment) return fallback;
  return cleanLabel(appointment.package_appointment?.package?.name)
    || cleanLabel(appointment.package_name_snapshot)
    || cleanLabel(extractPackageNameFromNotes(appointment.notes))
    || fallback;
};

export const formatAppointmentServiceWithPackageContext = (
  appointment?: AppointmentServiceLabelSource | null,
) => {
  const serviceName = resolveAppointmentStepServiceName(appointment);
  if (!isPackageAppointmentLike(appointment)) return serviceName;
  const packageName = resolveAppointmentPackageName(appointment, '');
  return packageName ? `${serviceName} (${packageName})` : serviceName;
};
