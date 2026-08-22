/**
 * Rastreia o teclado virtual (iOS Safari / Chrome Android) e expõe a altura
 * ocupada por ele na variável CSS `--kb-inset`.
 *
 * Isso permite que containers de rolagem (AppLayout, diálogos, sheets)
 * encolham quando o teclado abre — garantindo que o campo ativo e os botões
 * Salvar/Cancelar continuem acessíveis.
 */
export function initKeyboardInsetTracking() {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  const vv = window.visualViewport;

  const apply = (px: number) => {
    const value = Math.max(0, Math.round(px));
    root.style.setProperty('--kb-inset', `${value}px`);
    if (value > 0) root.setAttribute('data-keyboard-open', 'true');
    else root.removeAttribute('data-keyboard-open');
  };

  if (!vv) {
    apply(0);
    return;
  }

  const update = () => {
    // Diferença entre a janela e a viewport visível = teclado (ou barras).
    const hidden = window.innerHeight - (vv.height + vv.offsetTop);
    // Ignora variações pequenas (barras de navegador) para não "pular".
    apply(hidden > 120 ? hidden : 0);
  };

  update();
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  window.addEventListener('orientationchange', () => setTimeout(update, 250));

  // Garante que o campo focado fique visível acima do teclado.
  document.addEventListener(
    'focusin',
    (event) => {
      const el = event.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !el.isContentEditable) return;
      setTimeout(() => {
        try {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch {
          // navegadores antigos: ignora
        }
      }, 320);
    },
    true,
  );
}
