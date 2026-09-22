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

/**
 * No Android é possível pedir ao sistema para reabrir o endereço atual no
 * Chrome. No iPhone isso não existe: só copiar o link e abrir no Safari.
 */
export function openInSystemBrowser(): 'opened' | 'copied' | 'unavailable' {
  if (typeof window === 'undefined') return 'unavailable';
  const url = window.location.href;
  if (isAndroidDevice()) {
    const withoutScheme = url.replace(/^https?:\/\//, '');
    const intent = `intent://${withoutScheme}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
    try {
      window.location.href = intent;
      return 'opened';
    } catch {
      /* segue para a cópia do link */
    }
  }
  try {
    void navigator.clipboard?.writeText(url);
    return 'copied';
  } catch {
    return 'unavailable';
  }
}
