/**
 * Guarda a última tela aberta para que o aplicativo instalado (ícone na tela
 * inicial) reabra exatamente onde o profissional parou, em vez de voltar para
 * a página inicial pública.
 */
import { isRunningInstalled } from './installPrompt';

const KEY = 'app-last-route';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const IGNORED_PREFIXES = ['/', '/auth', '/login', '/cadastro', '/assinatura', '/oauth', '/preencher'];

export function rememberRoute(pathname: string, search = '') {
  try {
    if (!pathname || pathname === '/') return;
    if (IGNORED_PREFIXES.some((p) => p !== '/' && pathname.startsWith(p))) return;
    localStorage.setItem(KEY, JSON.stringify({ url: pathname + search, ts: Date.now() }));
  } catch {
    /* armazenamento indisponível */
  }
}

export function readRememberedRoute(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url?: string; ts?: number };
    if (!parsed?.url || !parsed.ts) return null;
    if (Date.now() - parsed.ts > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed.url;
  } catch {
    return null;
  }
}

/**
 * Restaura a rota salva apenas quando o app foi aberto pelo ícone instalado
 * (start_url `/`). Navegação normal pelo navegador não é afetada.
 */
export function restoreRememberedRouteIfInstalled() {
  if (typeof window === 'undefined') return;
  if (!isRunningInstalled()) return;
  const path = window.location.pathname;
  if (path !== '/' && path !== '') return;
  if (window.location.search || window.location.hash) return;
  const target = readRememberedRoute();
  if (!target || target === '/') return;
  try {
    window.history.replaceState(null, '', target);
  } catch {
    /* ignore */
  }
}
