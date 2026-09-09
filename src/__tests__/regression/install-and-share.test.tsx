import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { InstallAppButton } from '@/components/pwa/InstallAppButton';
import { ShareAppLinkCard } from '@/components/admin/ShareAppLinkCard';

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event: any = new Event('beforeinstallprompt');
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as any);
});

describe('botão de instalar aplicativo', () => {
  it('aparece mesmo sem convite automático, com instruções manuais', async () => {
    render(<InstallAppButton />);
    const button = await screen.findByTestId('install-app-button');
    await act(async () => { fireEvent.click(button); });
    expect(await screen.findByText('Adicionar à tela de início')).toBeTruthy();
  });

  it('instala pelo convite do navegador e some depois de instalado', async () => {
    render(<InstallAppButton />);
    await act(async () => { fireBeforeInstallPrompt('accepted'); });

    const button = await screen.findByTestId('install-app-button');
    await act(async () => { fireEvent.click(button); });

    await waitFor(() => expect(screen.queryByTestId('install-app-button')).toBeNull());
    expect(localStorage.getItem('app-install-done')).toBe('true');
  });

  it('volta a aparecer quando o aplicativo foi removido do aparelho', async () => {
    // Registro antigo de instalação + novo convite do navegador = app removido.
    localStorage.setItem('app-install-done', 'true');
    render(<InstallAppButton />);
    await act(async () => { fireBeforeInstallPrompt(); });

    expect(await screen.findByTestId('install-app-button')).toBeTruthy();
    expect(localStorage.getItem('app-install-done')).toBeNull();
  });

  it('fica oculto enquanto o aplicativo está aberto instalado', () => {
    vi.stubGlobal('matchMedia', ((query: string) => ({
      matches: query.includes('standalone'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })) as any);
    render(<InstallAppButton />);
    expect(screen.queryByTestId('install-app-button')).toBeNull();
  });
});

describe('compartilhar link do aplicativo', () => {
  it('copia o endereço atual do aplicativo', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText }, share: undefined });

    render(<ShareAppLinkCard />);
    expect(screen.getByTestId('share-app-link-value').textContent).toBe(window.location.origin);

    await act(async () => { fireEvent.click(screen.getByTestId('share-app-link-button')); });
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(window.location.origin));
  });
});
