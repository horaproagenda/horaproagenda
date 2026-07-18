/**
 * routePrefetch
 *
 * Mapeia hrefs de rota → função de import dinâmico (mesmos chunks usados
 * por `React.lazy` em `App.tsx`). Ao passar o mouse ou focar um link do
 * Sidebar, disparamos o import para que o chunk já esteja no cache do
 * navegador quando o usuário clicar.
 *
 * Dedupe: uma vez requisitada, uma rota nunca é prefetched novamente.
 */

type Loader = () => Promise<unknown>;

const loaders: Record<string, Loader> = {
  '/': () => import('@/pages/Index'),
  '/dashboard': () => import('@/pages/Index'),
  '/agenda': () => import('@/pages/Agenda'),
  '/clientes': () => import('@/pages/Clientes'),
  '/servicos': () => import('@/pages/Servicos'),
  '/cadastros': () => import('@/pages/Cadastros'),
  '/caixa': () => import('@/pages/Caixa'),
  '/financeiro': () => import('@/pages/Financeiro'),
  '/produtos': () => import('@/pages/Produtos'),
  '/lembretes': () => import('@/pages/Lembretes'),
  '/documentos': () => import('@/pages/Documentos'),
  '/relatorios': () => import('@/pages/Relatorios'),
  '/configuracoes': () => import('@/pages/Configuracoes'),
  '/ajuda': () => import('@/pages/Ajuda'),
  '/suporte': () => import('@/pages/Suporte'),
  '/super-admin': () => import('@/pages/SuperAdmin'),
  '/admin': () => import('@/pages/AdminPanel'),
  '/usuarios-conta': () => import('@/pages/UsuariosConta'),
  '/assinatura': () => import('@/pages/Assinatura'),
};

const prefetched = new Set<string>();
const inflight = new Map<string, Promise<unknown>>();

export function prefetchRoute(href: string): void {
  if (prefetched.has(href) || inflight.has(href)) return;
  const loader = loaders[href];
  if (!loader) return;
  const p = loader()
    .then((mod) => {
      prefetched.add(href);
      return mod;
    })
    .catch((err) => {
      // Falha silenciosa: o próximo clique dispara o import de novo.
      // eslint-disable-next-line no-console
      console.warn(`[routePrefetch] falha em ${href}:`, err);
    })
    .finally(() => {
      inflight.delete(href);
    });
  inflight.set(href, p);
}

/**
 * Warm up de várias rotas de uma só vez (quando o usuário abre a barra
 * lateral, por exemplo). Executa em `requestIdleCallback` para não
 * competir com a renderização em curso.
 */
export function prefetchRoutes(hrefs: string[]): void {
  const run = () => hrefs.forEach(prefetchRoute);
  const ric = (
    window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (typeof ric === 'function') {
    ric(run, { timeout: 500 });
  } else {
    setTimeout(run, 50);
  }
}
