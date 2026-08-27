import { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PageHeaderActionsProps {
  title: ReactNode;
  subtitle?: ReactNode;
  onBack?: () => void;
  actions?: ReactNode;
  className?: string;
}

/**
 * Cabeçalho de página padrão: título (com voltar opcional) + ações.
 * As ações quebram para a linha de baixo em telas estreitas, evitando
 * sobreposição com o título.
 */
export function PageHeaderActions({
  title,
  subtitle,
  onBack,
  actions,
  className,
}: PageHeaderActionsProps) {
  return (
    <div className={cn('page-header-row', className)}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={onBack}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold leading-tight sm:text-lg">{title}</h1>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
