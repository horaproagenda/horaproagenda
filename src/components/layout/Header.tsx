import { Menu, RefreshCw } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NotificationsPanel } from './NotificationsPanel';
import { OfflineStatusBadge } from '@/components/shared/OfflineStatusBadge';
import { useGlobalRefresh } from '@/hooks/useGlobalRefresh';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
}

export function Header({ title, subtitle, onMenuClick }: HeaderProps) {
  const { refreshAll, isRefreshing } = useGlobalRefresh();

  return (
    <header className="sticky top-0 z-30 flex h-14 md:h-20 items-center justify-between border-b border-border bg-background/95 px-3 md:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {/* Hamburger - mobile only */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="md:hidden h-9 w-9 shrink-0"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="font-display text-base md:text-2xl font-semibold text-foreground truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="hidden md:block mt-0.5 text-sm text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 md:gap-4 shrink-0">
        <OfflineStatusBadge />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={refreshAll}
              disabled={isRefreshing}
              className="relative h-9 w-9"
              aria-label="Sincronizar todos os dados"
            >
              <RefreshCw className={`h-4 w-4 md:h-5 md:w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="sr-only">Sincronizar todos os dados</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Sincronizar todos os dados</p>
          </TooltipContent>
        </Tooltip>

        {/* Notifications */}
        <NotificationsPanel />

        {/* User Menu */}
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 md:h-9 md:w-9 border-2 border-primary/20">
            <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs">
              AD
            </AvatarFallback>
          </Avatar>
          <div className="hidden lg:block">
            <p className="text-sm font-medium">Administrador</p>
            <p className="text-xs text-muted-foreground">admin@belezza.com</p>
          </div>
        </div>
      </div>
    </header>
  );
}
