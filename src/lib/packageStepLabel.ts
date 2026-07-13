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

  // Não repetir "Sessão N" nem prefixar com o nome do pacote — a linha já traz
  // o índice em badge e a data. Se realmente não houver serviço, retornar
  // string vazia para deixar apenas a data no rótulo.
  return '';
}
