/**
 * BrandMark — marca visual oficial do Hora Pro.
 *
 * Fonte única do ícone da marca para cabeçalhos (Auth, Sidebar, Landing,
 * telas de erro, etc.). NUNCA use um ícone genérico da lucide-react
 * (Sparkles, Star, Clock…) como logo — sempre importe este componente.
 *
 * Existe teste de regressão em
 * `src/components/brand/__tests__/brand-mark.test.tsx` que garante que
 * a tela de login continua exibindo esta marca.
 */
import horaProIcon from '@/assets/horapro-icon.png';
import { cn } from '@/lib/utils';

interface BrandMarkProps {
  className?: string;
  /** Tamanho em px (largura = altura). Default 40. */
  size?: number;
}

export function BrandMark({ className, size = 40 }: BrandMarkProps) {
  return (
    <img
      src={horaProIcon}
      alt="Hora Pro"
      data-brand-mark="hora-pro"
      width={size}
      height={size}
      className={cn('rounded-xl shadow-glow object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}

export default BrandMark;
