import { useState } from 'react';
import { Bell, Receipt, Package, Box, AlertTriangle, ChevronRight, X, Calendar, Clock, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNavigate } from 'react-router-dom';
import { useSystemNotifications, type SystemNotification } from '@/hooks/useSystemNotifications';
import { dismissNotification, dismissNotifications } from '@/lib/notificationDismissal';
import { cn } from '@/lib/utils';

const getNotificationIcon = (type: SystemNotification['type']) => {
  switch (type) {
    case 'boleto':
      return <Receipt className="h-4 w-4" />;
    case 'package':
      return <Package className="h-4 w-4" />;
    case 'stock':
    case 'usage_prediction':
      return <Box className="h-4 w-4" />;
    case 'expiry':
      return <Clock className="h-4 w-4" />;
    case 'reminder':
      return <Calendar className="h-4 w-4" />;
    case 'cash_register':
      return <Wallet className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
};

const getSeverityColor = (severity: SystemNotification['severity']) => {
  switch (severity) {
    case 'critical':
      return 'text-destructive bg-destructive/10';
    case 'warning':
      return 'text-amber-600 bg-amber-500/10';
    case 'info':
      return 'text-blue-600 bg-blue-500/10';
  }
};

export function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const { notifications, totalCritical } = useSystemNotifications();

  const activeNotifications = notifications.filter(n => !dismissedIds.has(n.id));
  const totalActive = activeNotifications.length;
  const criticalActive = activeNotifications.filter(n => n.severity === 'critical').length;

  const handleDismiss = (id: string) => {
    setDismissedIds(prev => new Set([...prev, id]));
  };

  const handleNavigate = (link?: string) => {
    if (link) {
      navigate(link);
      setOpen(false);
    }
  };

  if (totalActive === 0) {
    return (
      <Button variant="ghost" size="icon" className="relative" disabled>
        <Bell className="h-5 w-5 text-muted-foreground" />
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className={cn("h-5 w-5", criticalActive > 0 && "text-destructive")} />
          <Badge 
            variant={criticalActive > 0 ? "destructive" : "secondary"}
            className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full"
          >
            {totalActive}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <h4 className="font-semibold">Notificações</h4>
            </div>
            {criticalActive > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {criticalActive} crítico(s)
              </Badge>
            )}
          </div>
        </div>

        <ScrollArea className="max-h-[400px]">
          {activeNotifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            <div className="divide-y">
              {activeNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "p-3 flex items-start gap-3 transition-colors",
                    notification.severity === 'critical' && "bg-destructive/5",
                    notification.link && "cursor-pointer hover:bg-muted/50"
                  )}
                  onClick={() => notification.link && handleNavigate(notification.link)}
                >
                  <div className={cn(
                    "mt-0.5 p-2 rounded-lg",
                    getSeverityColor(notification.severity)
                  )}>
                    {getNotificationIcon(notification.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">{notification.title}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 -mt-1 -mr-1 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDismiss(notification.id);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {notification.description}
                    </p>
                    {notification.link && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-primary">
                        <span>Clique para ver detalhes</span>
                        <ChevronRight className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {activeNotifications.length > 0 && (
          <>
            <Separator />
            <div className="p-2">
              <Button
                variant="ghost"
                className="w-full text-sm text-muted-foreground"
                onClick={() => setDismissedIds(new Set(notifications.map(n => n.id)))}
              >
                Limpar todas as notificações
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
