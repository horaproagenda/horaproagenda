/**
 * userBusyGuard
 *
 * Helper para detectar se o usuário está com algum diálogo/popover aberto
 * (ex.: cadastrando histórico antigo, editando agendamento, etc.).
 *
 * Usado pelos watchers de versão (`useAppUpdater`, `useVersionWatcher`)
 * para POSTERGAR o reload automático de novo bundle enquanto o usuário
 * estiver no meio de um formulário — evitando perder dados digitados.
 */
export function isUserBusyInDialog(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    // Radix marca diálogos abertos com [data-state="open"] em [role="dialog"] ou [role="alertdialog"]
    const openDialogs = document.querySelectorAll(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    );
    if (openDialogs.length === 0) return false;

    // Considera "ocupado" se algum diálogo aberto contém input/textarea/select com valor
    for (const dlg of Array.from(openDialogs)) {
      const fields = dlg.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input, textarea, select',
      );
      for (const f of Array.from(fields)) {
        const v = (f as HTMLInputElement).value;
        if (v && v.trim() !== '' && v !== '09:00' && v !== '60' && v !== '4' && v !== '30') {
          return true;
        }
      }
      // Também respeita diálogo com foco ativo em um campo
      if (dlg.contains(document.activeElement) && document.activeElement?.tagName.match(/INPUT|TEXTAREA|SELECT/)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
