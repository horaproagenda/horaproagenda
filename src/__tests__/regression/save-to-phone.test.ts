import { describe, it, expect, beforeEach } from 'vitest';
import { detectInAppBrowser, isAndroidDevice } from '@/lib/inAppBrowser';
import { rememberRoute, readRememberedRoute } from '@/lib/lastRoute';

describe('navegador embutido de mensageiros', () => {
  it('reconhece WhatsApp, Instagram e Facebook', () => {
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone) WhatsApp/2.24')).toBe('whatsapp');
    expect(detectInAppBrowser('Mozilla/5.0 Instagram 300.0')).toBe('instagram');
    expect(detectInAppBrowser('Mozilla/5.0 [FBAN/FBIOS;FBAV/1]')).toBe('facebook');
  });

  it('não confunde Chrome e Safari normais', () => {
    expect(detectInAppBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/128 Mobile Safari/537.36')).toBeNull();
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Version/18.0 Safari/605.1')).toBeNull();
  });

  it('identifica Android para oferecer abertura no Chrome', () => {
    expect(isAndroidDevice('Mozilla/5.0 (Linux; Android 14)')).toBe(true);
    expect(isAndroidDevice('Mozilla/5.0 (iPhone)')).toBe(false);
  });
});

describe('última tela usada', () => {
  beforeEach(() => localStorage.clear());

  it('guarda telas internas e ignora páginas públicas', () => {
    rememberRoute('/agenda', '?dia=2026-09-22');
    expect(readRememberedRoute()).toBe('/agenda?dia=2026-09-22');

    rememberRoute('/assinatura');
    expect(readRememberedRoute()).toBe('/agenda?dia=2026-09-22');

    rememberRoute('/');
    expect(readRememberedRoute()).toBe('/agenda?dia=2026-09-22');
  });
});

describe('abrir no navegador do sistema', () => {
  it('avisa quando o mensageiro bloqueia a troca (nunca fica inerte)', async () => {
    vi.useFakeTimers();
    const { openInSystemBrowser } = await import('@/lib/inAppBrowser');
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14) WhatsApp/2.24',
      configurable: true,
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText }, share: undefined });

    const promise = openInSystemBrowser();
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;
    vi.useRealTimers();

    expect(['copied', 'unavailable']).toContain(result);
  });
});
