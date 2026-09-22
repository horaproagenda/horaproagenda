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

/**
 * Tenta reabrir o endereço atual no navegador do sistema com um único toque.
 * Android: intent direto para o Chrome (com qualquer navegador como reserva).
 * iPhone: tenta o Google Chrome e, se não existir, abre o menu de
 * compartilhamento do próprio celular (Safari, Google, Siri/Atalhos).
 * Em último caso, copia o endereço.
 */
export async function openInSystemBrowser(): Promise<OpenBrowserResult> {
  if (typeof window === 'undefined') return 'unavailable';
  const url = window.location.href;
  const withoutScheme = url.replace(/^https?:\/\//, '');

  if (isAndroidDevice()) {
    const fallback = encodeURIComponent(url);
    const intents = [
      `intent://${withoutScheme}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`,
      `intent://${withoutScheme}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${fallback};end`,
    ];
    for (const intent of intents) {
      try {
        window.location.href = intent;
        return 'opened';
      } catch {
        /* tenta a próxima forma */
      }
    }
  }

  if (isIOSDevice()) {
    try {
      window.location.href = `googlechromes://${withoutScheme}`;
      return 'opened';
    } catch {
      /* segue para o menu de compartilhamento */
    }
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

  try {
    await navigator.clipboard?.writeText(url);
    return 'copied';
  } catch {
    return 'unavailable';
  }
}
