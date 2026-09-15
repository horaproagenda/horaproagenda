import { ReactNode, useEffect, useRef } from 'react';

/**
 * Espaço reservado para os avisos fixos do topo (teste gratuito, carência,
 * renovação).
 *
 * Por que existe: o aviso é renderizado ACIMA do AppLayout, que ocupa a
 * altura inteira da tela (100dvh). Sem descontar a altura do aviso, o
 * conteúdo era empurrado para fora da tela no celular (rodapé cortado e
 * faixa branca alta no iPhone). Aqui medimos o aviso e expomos a altura em
 * `--app-banner-h`, que o AppLayout subtrai.
 *
 * Também reserva a safe-area do topo (notch / ilha dinâmica), senão o texto
 * do aviso fica embaixo do relógio e da bateria do iPhone.
 */
export function ChromeBannerSlot({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return;

    const apply = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      root.style.setProperty('--app-banner-h', `${h}px`);
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener('orientationchange', apply);
    window.addEventListener('resize', apply);

    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', apply);
      window.removeEventListener('resize', apply);
      root.style.setProperty('--app-banner-h', '0px');
    };
  }, []);

  return (
    <div ref={ref} data-app-banner className="pt-safe pl-safe pr-safe">
      {children}
    </div>
  );
}
