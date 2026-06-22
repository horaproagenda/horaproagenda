/**
 * userBusyGuard
 *
 * Helper para detectar se o usuário está com algum diálogo/popover aberto
 * ou digitando em qualquer formulário do app.
 *
 * Usado pelos watchers de versão (`useAppUpdater`, `useVersionWatcher`)
 * para POSTERGAR o reload automático de novo bundle enquanto o usuário
 * estiver no meio de um formulário — evitando perder dados digitados.
 */

// Rastreia o último input do usuário (qualquer tecla/digitação ou edição de campo)
let lastUserInputAt = 0;
const BUSY_WINDOW_MS = 90_000; // considera "ocupado" por 90s após última digitação

if (typeof window !== 'undefined') {
  const markBusy = () => {
    lastUserInputAt = Date.now();
  };
  window.addEventListener('input', markBusy, true);
  window.addEventListener('keydown', (e) => {
    const key = (e as KeyboardEvent)?.key;
    if (typeof key !== 'string') return;
    if (key.length === 1 || ['Backspace', 'Delete', 'Enter', 'Tab'].includes(key)) {
      markBusy();
    }
  }, true);
  window.addEventListener('change', markBusy, true);
}

export function markUserBusy(): void {
  lastUserInputAt = Date.now();
}

export function isUserBusyInDialog(): boolean {
  if (typeof document === 'undefined') return false;

  // 1) Usuário digitou recentemente em qualquer formulário do app?
  if (lastUserInputAt > 0 && Date.now() - lastUserInputAt < BUSY_WINDOW_MS) {
    return true;
  }

  try {
    // 2) Há algum diálogo, sheet, popover ou drawer aberto?
    const openOverlays = document.querySelectorAll(
      [
        '[role="dialog"][data-state="open"]',
        '[role="alertdialog"][data-state="open"]',
        '[data-radix-popper-content-wrapper]',
        '[data-vaul-drawer][data-state="open"]',
      ].join(','),
    );
    if (openOverlays.length > 0) return true;

    // 3) Foco ativo em algum campo editável?
    const ae = document.activeElement as HTMLElement | null;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
