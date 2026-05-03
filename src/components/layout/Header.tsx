import { RefreshCw } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NotificationsPanel } from './NotificationsPanel';
import { OfflineStatusBadge } from '@/components/shared/OfflineStatusBadge';
import { useGlobalRefresh } from '@/hooks/useGlobalRefresh';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { refreshAll, isRefreshing } = useGlobalRefresh();

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Global Refresh Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={refreshAll}
              disabled={isRefreshing}
              className="relative"
            >
              <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
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
          <Avatar className="h-9 w-9 border-2 border-primary/20">
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
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
