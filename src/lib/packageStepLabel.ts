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
  package_appointment?: {
    package?: { name?: string | null } | null;
  } | null;
};

export const isPackageAppointmentLike = (appointment?: AppointmentServiceLabelSource | null) => {
  if (!appointment) return false;
  return Boolean(
    appointment.package_appointment ||
    cleanLabel(appointment.package_name_snapshot),
  );
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
    return snapshotName || currentServiceName || MISSING_STEP_SERVICE_LABEL;
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
