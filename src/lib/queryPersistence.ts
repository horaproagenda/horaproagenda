import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';
import type { Query } from '@tanstack/react-query';

/**
 * Cache local (IndexedDB) das consultas: ao reabrir o app ou trocar de página,
 * os dados aparecem na hora e são revalidados em segundo plano.
 * O cache pertence a um único usuário; troca de identidade apaga tudo.
 */
const STORE_KEY = 'horapro-query-cache-v1';
const OWNER_KEY = 'horapro-query-cache-owner';
export const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24; // 24h
export const PERSIST_BUSTER = 'v1';

export const queryPersister = createAsyncStoragePersister({
  storage: {
    getItem: (k) => get<string>(k).then((v) => v ?? null),
    setItem: (k, v) => set(k, v),
    removeItem: (k) => del(k),
  },
  key: STORE_KEY,
  throttleTime: 2000,
});

/** Só persiste consultas concluídas com sucesso e não marcadas como voláteis. */
export function shouldPersistQuery(query: Query): boolean {
  if (query.state.status !== 'success') return false;
  const k = String((query.queryKey as unknown[])[0] ?? '');
  return !/lock|token|session|auth|signed-url|signedUrl|photo|whatsapp-qr/i.test(k);
}

export function getPersistedOwner(): string | null {
  try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
}

export function setPersistedOwner(userId: string | null): void {
  try {
    if (userId) localStorage.setItem(OWNER_KEY, userId);
    else localStorage.removeItem(OWNER_KEY);
  } catch { /* ignore */ }
}

export async function wipePersistedCache(): Promise<void> {
  try { await del(STORE_KEY); } catch { /* ignore */ }
}

/**
 * Na primeira identidade da sessão (reabrir o app), o cache restaurado do
 * mesmo usuário é mantido; qualquer outra troca exige limpar.
 */
export function mustClearOnIdentity(previous: string | null, next: string | null, persistedOwner: string | null): boolean {
  if (previous === next) return false;
  if (previous === null && next !== null && next === persistedOwner) return false;
  return true;
}
