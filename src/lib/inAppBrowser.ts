/**
 * Detecta os navegadores embutidos de mensageiros (WhatsApp, Instagram,
 * Facebook, Telegram, etc.). Neles o aplicativo é encerrado quando a tela
 * apaga ou o usuário troca de app, e não é possível salvar na tela inicial.
 */

export type InAppBrowserKind = 'whatsapp' | 'instagram' | 'facebook' | 'telegram' | 'other' | null;

export function detectInAppBrowser(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): InAppBrowserKind {
  const s = ua.toLowerCase();
  if (!s) return null;
  if (s.includes('whatsapp')) return 'whatsapp';
  if (s.includes('instagram')) return 'instagram';
  if (s.includes('fban') || s.includes('fbav') || s.includes('fb_iab')) return 'facebook';
  if (s.includes('telegram')) return 'telegram';
  // Android WebView genérico usado por vários mensageiros.
  if (s.includes('; wv)') || s.includes('line/') || s.includes('micromessenger')) return 'other';
  return null;
}

export const IN_APP_BROWSER_LABEL: Record<Exclude<InAppBrowserKind, null>, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  telegram: 'Telegram',
  other: 'outro aplicativo',
};

export function isAndroidDevice(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  return /android/i.test(ua);
}

export function isIOSDevice(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  return /iphone|ipad|ipod/i.test(ua);
}

export type OpenBrowserResult = 'opened' | 'shared' | 'copied' | 'unavailable';

/** Navegação que funciona dentro de WebViews de mensageiros (onde
 *  atribuir `location.href` costuma ser ignorado sem lançar erro). */
function tryNavigate(target: string): boolean {
  try {
    const a = document.createElement('a');
    a.href = target;
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    /* segue para as reservas */
  }
  try {
    const w = window.open(target, '_blank');
    if (w) return true;
  } catch {
    /* ignore */
  }
  try {
    window.location.href = target;
    return true;
  } catch {
    return false;
  }
}

/** Espera um pouco e informa se a página perdeu o foco — sinal de que outro
 *  app/navegador realmente assumiu a tela. */
function leftThePage(ms = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('blur', onLeave);
      resolve(value);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') finish(true);
    };
    const onLeave = () => finish(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('blur', onLeave);
    window.setTimeout(() => finish(false), ms);
  });
}

async function copyUrl(url: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    /* tenta a forma antiga */
  }
  try {
    const input = document.createElement('textarea');
    input.value = url;
    input.setAttribute('readonly', 'true');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    input.setSelectionRange(0, url.length);
    const ok = document.execCommand('copy');
    input.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Tenta reabrir o endereço atual no navegador do sistema com um único toque.
 * Android: intent direto para o Chrome (com qualquer navegador como reserva).
 * iPhone: tenta o Safari (x-safari-https) e o Google Chrome; se nada abrir,
 * usa o menu de compartilhamento do celular (Safari, Google, Siri/Atalhos).
 * Em último caso, copia o endereço.
 */
export async function openInSystemBrowser(): Promise<OpenBrowserResult> {
  if (typeof window === 'undefined') return 'unavailable';
  const url = window.location.href;
  const withoutScheme = url.replace(/^https?:\/\//, '');
  const fallback = encodeURIComponent(url);

  const candidates = isAndroidDevice()
    ? [
        `intent://${withoutScheme}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`,
        `intent://${withoutScheme}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${fallback};end`,
      ]
    : isIOSDevice()
      ? [`x-safari-https://${withoutScheme}`, `googlechromes://${withoutScheme}`]
      : [];

  for (const target of candidates) {
    if (!tryNavigate(target)) continue;
    if (await leftThePage()) return 'opened';
  }

  const share = (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share;
  if (typeof share === 'function') {
    try {
      await share.call(navigator, { title: 'Hora Pro', url });
      return 'shared';
    } catch {
      /* usuário fechou ou não suportado */
    }
  }

  return (await copyUrl(url)) ? 'copied' : 'unavailable';
}
