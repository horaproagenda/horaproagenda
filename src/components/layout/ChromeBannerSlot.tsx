import { ReactNode } from 'react';

/**
 * Espaço reservado para os avisos fixos do topo (teste gratuito, carência,
 * renovação).
 *
 * O slot faz parte da coluna única do app, portanto sua altura é descontada
 * naturalmente pelo flex layout. Também reserva a safe-area superior; quando
 * ele existe, o cabeçalho não a reserva novamente.
 */
export function ChromeBannerSlot({ children }: { children: ReactNode }) {
  return (
    <div data-app-banner className="shrink-0 pt-safe pl-safe pr-safe">
      {children}
    </div>
  );
}
