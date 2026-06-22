import { forwardRef } from 'react';
import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface CompactFilterTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Quantidade de filtros ativos (renderiza badge se > 0) */
  activeCount?: number;
  /** Texto do botão. Default: "Filtros" */
  label?: string;
}

/**
 * Botão padrão para abrir popovers de filtro em todo o app.
 * Mantém a mesma aparência do filtro da Agenda:
 * - h-7, text-[11px]
 * - Ícone SlidersHorizontal
 * - Borda primária quando há filtros ativos
 * - Badge inline com contagem
 */
export const CompactFilterTrigger = forwardRef<
  HTMLButtonElement,
  CompactFilterTriggerProps
>(({ activeCount = 0, label = 'Filtros', className, ...props }, ref) => {
  const hasActive = activeCount > 0;
  return (
    <Button
      ref={ref}
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        'h-7 gap-1.5 px-2 text-[11px] font-medium',
        hasActive && 'border-primary text-primary',
        className,
      )}
      {...props}
    >
      <Filter className="h-3 w-3" />
      <span>{label}</span>
      {hasActive && (
        <Badge
          variant="secondary"
          className="h-4 min-w-4 px-1 text-[10px] leading-none justify-center"
        >
          {activeCount}
        </Badge>
      )}
    </Button>
  );
});
CompactFilterTrigger.displayName = 'CompactFilterTrigger';
