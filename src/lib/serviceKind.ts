/**
 * Kits de serviço são serviços compostos (têm etapas em service_components /
 * component_service_ids). Kits têm forma de agendamento e cobrança próprias,
 * portanto não podem ser oferecidos como etapa/serviço de pacote comum ou
 * sequencial — e pacotes não podem compor kits.
 */
export function isKitService(service: any): boolean {
  if (!service) return false;
  const components = service.service_components;
  if (Array.isArray(components) && components.length > 0) return true;
  const ids = service.component_service_ids;
  return Array.isArray(ids) && ids.length > 0;
}

/** Remove kits de uma lista de serviços, mantendo ids já selecionados (para não perder rótulos). */
export function withoutKitServices<T>(services: T[], keepIds: Array<string | null | undefined> = []): T[] {
  const keep = new Set(keepIds.filter(Boolean) as string[]);
  return (services || []).filter((service: any) => !isKitService(service) || keep.has(service?.id));
}
