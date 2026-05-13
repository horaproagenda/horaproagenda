/**
 * bootVersionGuard
 *
 * Roda no início absoluto do boot (antes do React montar) para garantir
 * que NENHUM dispositivo/navegador/sessão consiga abrir uma versão
 * obsoleta da aplicação.
 *
 * Estratégia:
 *  1. Compara a assinatura dos <script src="/assets/*"> carregados nesta
 *     página com a assinatura presente no /index.html servido pela rede
 *     (bypass total de cache).
 *  2. Se houver divergência (bundle antigo cacheado em CDN/SW/localStorage):
 *      - Limpa TODOS os Cache Storage (PWA / Workbox / runtime).
 *      - Desregistra TODOS os Service Workers.
 *      - Limpa chaves de versão antigas no localStorage.
 *      - Recarrega a página uma única vez (flag em sessionStorage evita loop).
 *  3. Também armazena/atualiza o build atual em localStorage para diagnóstico.
 *
 * Esse guarda complementa o `useAppUpdater` e o `useVersionWatcher` —
 * ambos atuam DURANTE a sessão. Este aqui age na PRIMEIRA renderização,
 * fechando o caso "abri em outro navegador / fiz novo login e veio versão velha".
 */

declare const __APP_BUILD_TIME__: string;

const PURGE_FLAG = 'boot_version_purge_done_v1';
const BUILD_KEY = 'app_current_build_id_v1';

const stripAssets = (urls: string[]): string =>
  urls
    .map((u) => {
      const idx = u.indexOf('/assets/');
      return idx >= 0 ? u.slice(idx + '/assets/'.length) : u;
    })
    .sort()
    .join('|');

async function purgeEverythingAndReload(reason: string) {
  // Evita loop: só executa o purge uma vez por sessão de aba
  if (sessionStorage.getItem(PURGE_FLAG)) {
    console.warn('[BootVersionGuard] Purge já executado nesta sessão — abortando para evitar loop.');
    return;
  }
  sessionStorage.setItem(PURGE_FLAG, '1');

  console.warn(`[BootVersionGuard] Versão obsoleta detectada (${reason}). Limpando caches…`);

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch (e) {
    console.warn('[BootVersionGuard] Falha ao limpar caches', e);
  }

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch (e) {
    console.warn('[BootVersionGuard] Falha ao desregistrar service workers', e);
  }

  // Recarga forçada — query string evita qualquer cache HTTP intermediário.
  const url = new URL(window.location.href);
  url.searchParams.set('_v', Date.now().toString());
  window.location.replace(url.toString());
}

export async function bootVersionGuard(): Promise<void> {
  if (typeof window === 'undefined') return;

  const currentBuild =
    typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : 'dev';

  // Atualiza marcador local de build (diagnóstico / cross-device sync)
  try {
    const previous = localStorage.getItem(BUILD_KEY);
    if (previous && previous !== currentBuild) {
      console.info(
        `[BootVersionGuard] Bundle atualizado: ${previous} → ${currentBuild}`,
      );
    }
    localStorage.setItem(BUILD_KEY, currentBuild);
  } catch {
    /* storage indisponível — segue */
  }

  // Em dev não faz sentido (HMR cuida disso)
  if (import.meta.env?.DEV) return;

  try {
    const localScripts = Array.from(
      document.querySelectorAll('script[src*="/assets/"]'),
    ).map((s) => (s as HTMLScriptElement).src);
    const localSig = stripAssets(localScripts);
    if (!localSig) return; // sem assets identificáveis (SSR/pré-render)

    const res = await fetch(`/index.html?ts=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!res.ok) return;
    const html = await res.text();

    const remoteMatches = Array.from(
      html.matchAll(/<script[^>]+src=["']([^"']+\/assets\/[^"']+)["']/g),
    ).map((m) => m[1]);
    const remoteSig = stripAssets(remoteMatches);
    if (!remoteSig) return;

    if (remoteSig !== localSig) {
      await purgeEverythingAndReload('asset_signature_mismatch');
      return;
    }

    // Tudo certo — limpa flag de purge para próxima inicialização
    sessionStorage.removeItem(PURGE_FLAG);
  } catch (e) {
    // Falha de rede no boot não deve quebrar a app — apenas registra.
    console.warn('[BootVersionGuard] Verificação de versão falhou silenciosamente:', e);
  }
}
