import { Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { Appointment } from '@/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { getCategoryColor } from '@/lib/categoryColors';

interface AppointmentCardProps {
  appointment: Appointment;
  compact?: boolean;
}

const statusConfig = {
  scheduled: {
    label: 'Agendado',
    className: 'bg-info/10 text-info border-info/20',
  },
  confirmed: {
    label: 'Confirmado',
    className: 'bg-success/10 text-success border-success/20',
  },
  completed: {
    label: 'Concluído',
    className: 'bg-muted text-muted-foreground border-muted',
  },
  cancelled: {
    label: 'Cancelado',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
};

export function AppointmentCard({ appointment, compact = false }: AppointmentCardProps) {
  const status = statusConfig[appointment.status];
  const categoryColor = appointment.service ? getCategoryColor(appointment.service.category) : null;
  const hexColor = categoryColor?.hex || '#999';
  const timeStr = format(new Date(appointment.start_time), 'HH:mm');

  if (compact) {
    return (
      <div 
        className="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-all duration-200 hover:border-primary/30 hover:shadow-md"
        style={{ borderLeftColor: hexColor, borderLeftWidth: '3px' }}
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{appointment.client?.name}</p>
          <p className="text-xs text-muted-foreground truncate">{appointment.service?.name}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium">{timeStr}</p>
          <p className="text-xs text-muted-foreground">{appointment.service?.duration}min</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="group rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-lg animate-fade-in"
      style={{ borderLeftColor: hexColor, borderLeftWidth: '4px' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-foreground truncate">
              {appointment.client?.name}
            </h4>
            <Badge variant="outline" className={cn('text-xs', status.className)}>
              {status.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {appointment.service?.name}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" />
          <span>{timeStr}</span>
          <span className="text-xs">({appointment.service?.duration}min)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <User className="h-4 w-4" />
          <span>{appointment.client?.phone}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span 
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ backgroundColor: `${hexColor}20`, color: hexColor }}
        >
          {appointment.service?.category}
        </span>
        <span className="text-sm font-semibold text-foreground">
          R$ {appointment.service?.price.toFixed(2)}
        </span>
      </div>
    </div>
  );
}