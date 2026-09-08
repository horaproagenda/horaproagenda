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
  it('fica oculto sem convite de instalação', () => {
    render(<InstallAppButton />);
    expect(screen.queryByTestId('install-app-button')).toBeNull();
  });

  it('aparece após o convite e desaparece depois de instalar', async () => {
    render(<InstallAppButton />);
    fireBeforeInstallPrompt('accepted');

    const button = await screen.findByTestId('install-app-button');
    await act(async () => { fireEvent.click(button); });

    await waitFor(() => expect(screen.queryByTestId('install-app-button')).toBeNull());
    expect(localStorage.getItem('app-install-done')).toBe('true');
  });

  it('não volta a aparecer quando já foi instalado antes', () => {
    localStorage.setItem('app-install-done', 'true');
    render(<InstallAppButton />);
    fireBeforeInstallPrompt();
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
