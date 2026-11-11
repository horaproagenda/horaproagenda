/**
 * Confere, após vincular, quais alvos (serviços ou pacotes) realmente
 * possuem o vínculo gravado no banco. Retorna os alvos que faltaram.
 */
export function findMissingLinks(
  requestedTargetIds: string[],
  persistedTargetIds: Array<string | null | undefined>,
): string[] {
  const saved = new Set(persistedTargetIds.filter(Boolean) as string[]);
  return requestedTargetIds.filter((id) => !saved.has(id));
}
