import { ReactNode } from 'react';
import { Lightbulb, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { cn } from '@/lib/utils';

interface HelpTipProps {
  storageKey: string;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

/** Dica recolhível e dispensável; lembra o estado no aparelho. */
export function HelpTip({ storageKey, title, children, defaultOpen = true, className }: HelpTipProps) {
  const [open, setOpen] = useLocalStorage<boolean>(`helptip:${storageKey}:open`, defaultOpen);
  const [hidden, setHidden] = useLocalStorage<boolean>(`helptip:${storageKey}:hidden`, false);

  if (hidden) {
    return (
      <div className={cn('flex justify-end', className)}>
        <button
          type="button"
          onClick={() => { setHidden(false); setOpen(true); }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
        >
          <Lightbulb className="h-3.5 w-3.5" /> Ver dica
        </button>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border border-primary/20 bg-primary/5', className)}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex flex-1 items-center gap-2 text-left text-xs font-medium text-foreground"
          aria-expanded={open}
        >
          <Lightbulb className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1">{title}</span>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setHidden(true)} aria-label="Fechar dica">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {open && <div className="px-3 pb-3 text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}
