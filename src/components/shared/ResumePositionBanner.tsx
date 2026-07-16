import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, X, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ListPositionState } from '@/hooks/useListPosition';

interface ResumePositionBannerProps {
  state: ListPositionState | null;
  onResume: () => void;
  onDismiss: () => void;
  /** Texto custom: "Voltar para perfil de João" etc. Se ausente, é gerado a partir do state. */
  label?: string;
  className?: string;
}

export function ResumePositionBanner({
  state,
  onResume,
  onDismiss,
  label,
  className,
}: ResumePositionBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state) {
      const t = setTimeout(() => setVisible(true), 100);
      return () => clearTimeout(t);
    }
    setVisible(false);
  }, [state]);

  if (!state) return null;

  const computedLabel =
    label ??
    (state.lastItemLabel
      ? `Voltar para o perfil de ${state.lastItemLabel}`
      : state.letter
        ? `Voltar para a letra "${state.letter}"`
        : state.search
          ? `Voltar para a busca "${state.search}"`
          : state.page && state.page > 1
            ? `Voltar para a página ${state.page}`
            : 'Retomar de onde parou');

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs shadow-sm',
        'transition-all duration-300',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="rounded-md bg-primary/10 p-1.5 flex-shrink-0">
          <History className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="truncate text-foreground">{computedLabel}</span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          size="sm"
          variant="default"
          className="h-7 px-2 text-[11px] gap-1"
          onClick={onResume}
        >
          <ArrowUpRight className="h-3 w-3" />
          Retomar
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={onDismiss}
          aria-label="Dispensar"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
