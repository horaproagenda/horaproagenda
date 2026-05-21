// Helpers + invariantes para upload de arquivos do cliente.
// As políticas RLS do Storage (client-photos / client-documents) exigem que a PRIMEIRA
// pasta do object name seja exatamente o UUID do cliente. Manter essa regra centralizada
// evita regressões no upload de fotos e documentos.

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string | null | undefined): boolean =>
  !!value && UUID_REGEX.test(value);

export const sanitizeFileName = (name: string) =>
  (name || 'arquivo').replace(/[^a-zA-Z0-9.-]/g, '_');

export const buildClientStoragePath = (
  clientId: string,
  fileName: string,
  subfolder?: 'photos' | 'documents',
): string => {
  if (!isUuid(clientId)) {
    throw new Error('UUID de cliente inválido para upload.');
  }
  const safe = sanitizeFileName(fileName);
  const stamp = Date.now();
  const unique = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${stamp}-${Math.random().toString(36).slice(2)}`;
  const segments = [clientId];
  if (subfolder) segments.push(subfolder);
  segments.push(`${stamp}-${unique}-${safe}`);
  return segments.join('/');
};

export const assertClientStoragePath = (clientId: string, path: string) => {
  const first = String(path || '').split('/')[0];
  if (!isUuid(clientId) || first !== clientId) {
    throw new Error(`Caminho de upload "${path}" não pertence ao cliente ${clientId}.`);
  }
};
