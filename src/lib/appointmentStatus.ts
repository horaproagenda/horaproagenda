import { AppointmentStatus } from '@/types';

export const appointmentStatusConfig: Record<AppointmentStatus, { label: string; className: string; dotClassName: string }> = {
  scheduled: {
    label: 'Agendado',
    className: 'bg-info/10 text-info border-info/20',
    dotClassName: 'bg-info',
  },
  confirmed: {
    label: 'Confirmado',
    className: 'bg-info/10 text-info border-info/20',
    dotClassName: 'bg-info',
  },
  completed: {
    label: 'Realizado',
    className: 'bg-success/10 text-success border-success/20',
    dotClassName: 'bg-success',
  },
  cancelled: {
    label: 'Cancelado',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
    dotClassName: 'bg-destructive',
  },
  missed: {
    label: 'Faltou',
    className: 'bg-warning/10 text-warning border-warning/20',
    dotClassName: 'bg-warning',
  },
  rescheduled: {
    label: 'Reagendado',
    className: 'bg-primary/10 text-primary border-primary/20',
    dotClassName: 'bg-primary',
  },
};

export const getAppointmentStatusConfig = (status?: string | null) => {
  return appointmentStatusConfig[(status as AppointmentStatus) || 'scheduled'] || appointmentStatusConfig.scheduled;
};

export const getAppointmentStatusStyle = (status?: string | null) => {
  const tokenByStatus: Record<AppointmentStatus, string> = {
    scheduled: 'info',
    confirmed: 'info',
    completed: 'success',
    cancelled: 'destructive',
    missed: 'warning',
    rescheduled: 'primary',
  };
  const token = tokenByStatus[(status as AppointmentStatus) || 'scheduled'] || 'info';
  return {
    backgroundColor: `hsl(var(--${token}) / 0.14)`,
    borderLeft: `3px solid hsl(var(--${token}))`,
  };
};