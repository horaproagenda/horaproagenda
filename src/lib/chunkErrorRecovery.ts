/**
 * Quando o app carrega um chunk lazy (rota) cujo arquivo não existe mais
 * — porque uma nova versão foi publicada e mudou os hashes — o import()
 * dinâmico falha com "ChunkLoadError" / "Failed to fetch dynamically
 * imported module". Sem tratamento, o usuário vê uma tela em branco ou,
 * pior, um chunk de outra rota servido pelo Service Worker antigo.
 *
 * Este utilitário detecta esse erro globalmente e força UM reload para
 * que o navegador baixe o index.html novo (com os hashes corretos).
 * Usa sessionStorage para evitar loop de reload caso o erro persista.
 */
const RELOADED_KEY = '__chunk_reload_done__';

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const message = String((err as { message?: string })?.message || err);
  const name = String((err as { name?: string })?.name || '');
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

async function hardReload(reason: string) {
  console.warn('[chunk-recovery] Recarregando para corrigir chunk obsoleto:', reason);
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch { /* noop */ }
  // Cache-bust: força o navegador a rebaixar o index.html do servidor
  const url = new URL(window.location.href);
  url.searchParams.set('__r', Date.now().toString(36));
  window.location.replace(url.toString());
}

function reloadOnce(reason: string) {
  try {
    const count = Number(sessionStorage.getItem(RELOADED_KEY) || '0');
    if (count >= 2) {
      console.error('[chunk-recovery] Recarregamento já tentado 2x, abortando para evitar loop.');
      return;
    }
    sessionStorage.setItem(RELOADED_KEY, String(count + 1));
  } catch { /* noop */ }
  void hardReload(reason);
}

export function installChunkErrorRecovery() {
  // Reset do flag em navegação bem-sucedida
  window.addEventListener('load', () => {
    setTimeout(() => {
      try { sessionStorage.removeItem(RELOADED_KEY); } catch { /* noop */ }
    }, 5000);
  });

  window.addEventListener('error', (event) => {
    if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
      reloadOnce('window.error');
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) {
      reloadOnce('unhandledrejection');
    }
  });
}

/**
 * Envolve `() => import(...)` com retry + reload automático.
 * Use junto com React.lazy para que rotas com chunk obsoleto não
 * deixem a tela em branco após uma nova publicação.
 */
export function lazyWithRetry<T>(factory: () => Promise<T>, retries = 1): () => Promise<T> {
  return async () => {
    try {
      return await factory();
    } catch (err) {
      if (isChunkLoadError(err)) {
        if (retries > 0) {
          await new Promise((r) => setTimeout(r, 250));
          try {
            return await factory();
          } catch (err2) {
            if (isChunkLoadError(err2)) reloadOnce('lazyWithRetry');
            throw err2;
          }
        }
        reloadOnce('lazyWithRetry');
      }
      throw err;
    }
  };
}

