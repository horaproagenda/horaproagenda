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
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { ClientCredits } from '@/hooks/useClientCredits';
import { getAppointmentStatusConfig, getAppointmentStatusStyle } from '@/lib/appointmentStatus';
import { getAppointmentPackageApplicationLabel } from '@/lib/packageSequence';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { formatTimeInTimeZone } from '@/lib/timezone';

interface AppointmentCardProps {
  appointment: Appointment;
  compact?: boolean;
  professionals?: Professional[];
  onEdit?: (appointment: Appointment) => void;
  onDelete?: () => void;
}

const paymentStatusConfig = {
  pending: { label: 'Pendente', icon: AlertCircle, className: 'text-warning/70' },
  partial: { label: 'Parcial', icon: Clock, className: 'text-info/70' },
  paid: { label: 'Pago', icon: CheckCircle, className: 'text-success/70' },
};

export function AppointmentCard({ appointment, compact = false, professionals = [], onEdit, onDelete }: AppointmentCardProps) {
  const status = getAppointmentStatusConfig(appointment.status);
  const { settings } = useBusinessSettings();
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
  const hexColor = professionalColor || categoryColor?.hex || '#a1a1aa';
  const statusStyle = getAppointmentStatusStyle(appointment.status);
  const isPackageAppointment = Boolean(appointment.package_appointment?.package);
  const displayServiceName = isPackageAppointment
    ? appointment.package_appointment?.package?.name || appointment.service?.name
    : appointment.service?.name;
  const applicationLabel = isPackageAppointment ? getAppointmentPackageApplicationLabel(appointment) : null;
  
  // Create softer version of the color for backgrounds
  const softHexColor = `${hexColor}15`;
  
  const timeStr = formatTimeInTimeZone(appointment.start_time, settings?.timezone);

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
        className="group flex items-center gap-2 rounded-md border border-border/50 bg-card/80 backdrop-blur-sm px-2.5 py-2 transition-all duration-300 ease-out hover:border-border hover:shadow-sm hover:bg-card"
        style={{ 
          ...statusStyle,
          borderLeftWidth: '2px',
        }}
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium text-xs truncate text-foreground/90">{appointment.client?.name}</p>
          <p className="text-[10px] text-muted-foreground/70 truncate">{displayServiceName}</p>
          {applicationLabel && <p className="text-[9px] text-primary font-medium truncate">{applicationLabel}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs font-medium text-foreground/80">{timeStr}</p>
          <p className="text-[10px] text-muted-foreground/60">{appointment.service?.duration}min</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-all duration-200"
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem 
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(appointment);
              }}
              className="text-xs"
            >
              <Pencil className="h-3 w-3 mr-2" />
              Editar
            </DropdownMenuItem>
            {canDelete && (
              <DropdownMenuItem
                className="text-xs text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteDialog(true);
                }}
              >
                <Trash2 className="h-3 w-3 mr-2" />
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
        className="group rounded-lg border border-border/40 bg-card/90 backdrop-blur-sm p-3 transition-all duration-300 ease-out hover:border-border/60 hover:shadow-md hover:bg-card animate-fade-in"
        style={{ 
          ...statusStyle,
          borderLeftWidth: '3px',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="font-medium text-sm text-foreground/90 truncate">
                {appointment.client?.name}
              </h4>
              <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 h-4 font-normal', status.className)}>
                {status.label}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground/70 truncate">
              {displayServiceName}
            </p>
            {applicationLabel && (
              <p className="text-[10px] text-primary font-medium truncate">{applicationLabel}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-all duration-200"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem 
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.(appointment);
                }}
                className="text-xs"
              >
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Editar
              </DropdownMenuItem>
              {canDelete && (
                <DropdownMenuItem
                  className="text-xs text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Excluir
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Time and Professional */}
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground/70">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span className="font-medium">{timeStr}</span>
            <span className="text-[10px]">({appointment.service?.duration}min)</span>
          </div>
          {professional && (
            <div className="flex items-center gap-1">
              <div 
                className="h-2 w-2 rounded-full transition-transform duration-200 group-hover:scale-110" 
                style={{ backgroundColor: professionalColor || '#a1a1aa' }}
              />
              <span className="text-[10px] truncate max-w-[80px]">{professional.name}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-2 pt-2 border-t border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span 
              className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-medium transition-colors duration-200"
              style={{ backgroundColor: softHexColor, color: hexColor }}
            >
              {appointment.service?.category}
            </span>
            <div className={cn('flex items-center gap-0.5', paymentStatus.className)}>
              <PaymentIcon className="h-3 w-3" />
              <span className="text-[9px] font-medium">{paymentStatus.label}</span>
            </div>
          </div>
          <span className="text-xs font-medium text-foreground/70">
            R$ {appointment.service?.price.toFixed(2)}
          </span>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Excluir Agendamento</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Excluir agendamento de "{appointment.client?.name}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
