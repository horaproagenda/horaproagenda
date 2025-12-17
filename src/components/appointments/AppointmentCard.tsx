import { useState } from 'react';
import { Clock, User, CheckCircle, AlertCircle, DollarSign, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Appointment, Professional } from '@/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCategoryColor } from '@/lib/categoryColors';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AppointmentCardProps {
  appointment: Appointment;
  compact?: boolean;
  professionals?: Professional[];
  onEdit?: (appointment: Appointment) => void;
  onDelete?: () => void;
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

const paymentStatusConfig = {
  pending: { label: 'Pendente', icon: AlertCircle, className: 'text-warning' },
  partial: { label: 'Parcial', icon: Clock, className: 'text-info' },
  paid: { label: 'Pago', icon: CheckCircle, className: 'text-success' },
};

export function AppointmentCard({ appointment, compact = false, professionals = [], onEdit, onDelete }: AppointmentCardProps) {
  const status = statusConfig[appointment.status as keyof typeof statusConfig] || statusConfig.scheduled;
  const paymentStatus = paymentStatusConfig[appointment.payment_status as keyof typeof paymentStatusConfig || 'pending'];
  const PaymentIcon = paymentStatus.icon;
  const categoryColor = appointment.service ? getCategoryColor(appointment.service.category) : null;
  const { hasRole } = useAuth();
  const canDelete = hasRole('admin');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Find professional from appointment.professional_id or service.professional_id
  const professionalId = appointment.professional_id || appointment.service?.professional_id;
  const professional = professionals.find(p => p.id === professionalId) || appointment.service?.professional;
  const professionalColor = professional?.agenda_color;
  const hexColor = professionalColor || categoryColor?.hex || '#999';
  
  const timeStr = format(new Date(appointment.start_time), 'HH:mm');

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', appointment.id);
      
      if (error) throw error;
      
      toast.success('Agendamento excluído com sucesso!');
      onDelete?.();
    } catch (error: any) {
      toast.error('Erro ao excluir agendamento: ' + error.message);
    }
    setShowDeleteDialog(false);
  };

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => {
              e.stopPropagation();
              onEdit?.(appointment);
            }}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            {canDelete && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteDialog(true);
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <>
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation();
                onEdit?.(appointment);
              }}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              {canDelete && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            <span>{timeStr}</span>
            <span className="text-xs">({appointment.service?.duration}min)</span>
          </div>
          {professional && (
            <div className="flex items-center gap-1.5">
              <div 
                className="h-3 w-3 rounded-full" 
                style={{ backgroundColor: professionalColor || '#999' }}
              />
              <span className="text-xs">{professional.name}</span>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span 
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: `${hexColor}20`, color: hexColor }}
            >
              {appointment.service?.category}
            </span>
            <div className={cn('flex items-center gap-1', paymentStatus.className)}>
              <PaymentIcon className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{paymentStatus.label}</span>
            </div>
          </div>
          <span className="text-sm font-semibold text-foreground">
            R$ {appointment.service?.price.toFixed(2)}
          </span>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Agendamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o agendamento de "{appointment.client?.name}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
