import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  User,
  Calendar,
  Clock,
  DollarSign,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Package,
  MapPin,
  Phone,
  Plus,
  Trash2,
  AlertTriangle,
  Gift,
  Edit,
  History,
  Save,
  X,
} from 'lucide-react';
import { Appointment, Professional, Room, AppointmentStatus } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useAppointments } from '@/hooks/useAppointments';
import { useRooms } from '@/hooks/useRooms';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useCardBrands } from '@/hooks/useCardBrands';
import { useCashRegisters } from '@/hooks/useCashRegisters';

interface AppointmentDetailDialogProps {
  appointment: Appointment | null;
  professionals: Professional[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPayment: (appointmentId: string, paymentMethods: { method: string; amount: number; cardBrandId?: string; installments?: number }[], clientCredit?: number, cashRegisterId?: string) => void;
}

const statusConfig: Record<AppointmentStatus, { label: string; className: string }> = {
  scheduled: { label: 'Agendado', className: 'bg-info/10 text-info border-info/20' },
  confirmed: { label: 'Confirmado', className: 'bg-success/10 text-success border-success/20' },
  completed: { label: 'Atendido', className: 'bg-muted text-muted-foreground border-muted' },
  cancelled: { label: 'Cancelado', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  missed: { label: 'Faltou', className: 'bg-warning/10 text-warning border-warning/20' },
  rescheduled: { label: 'Reagendado', className: 'bg-primary/10 text-primary border-primary/20' },
};

const paymentStatusConfig = {
  pending: { label: 'Pendente', icon: AlertCircle, className: 'text-warning' },
  partial: { label: 'Parcial', icon: Clock, className: 'text-info' },
  paid: { label: 'Pago', icon: CheckCircle, className: 'text-success' },
};

export function AppointmentDetailDialog({
  appointment,
  professionals,
  open,
  onOpenChange,
  onPayment,
}: AppointmentDetailDialogProps) {
  const { hasRole } = useAuth();
  const { updateAppointment, deleteAppointment, deletePackageAppointments } = useAppointments();
  const { rooms } = useRooms();
  const { activePaymentMethods } = usePaymentMethods();
  const { activeCardBrands } = useCardBrands();
  const { currentOpenRegister } = useCashRegisters();
  const canAddClientCredit = hasRole('admin');
  const canDelete = hasRole('admin');
  const canEdit = hasRole('admin') || hasRole('receptionist');
  
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payments, setPayments] = useState<{ method: string; methodId?: string; cardBrandId?: string; installments?: number; amount: string }[]>([
    { method: '', amount: '' },
  ]);
  const [clientCreditAmount, setClientCreditAmount] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'single' | 'all'>('single');
  const [showRescheduleOption, setShowRescheduleOption] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<AppointmentStatus | ''>('');
  
  // Excess payment handling (when amount paid > amount owed)
  const [excessAction, setExcessAction] = useState<'credit' | 'change' | null>(null);
  const [changePaymentMethodId, setChangePaymentMethodId] = useState<string | null>(null);
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editProfessionalId, setEditProfessionalId] = useState<string | null>(null);
  const [editRoomId, setEditRoomId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');

  // Helper function to check if payment method is card
  const isMethodCard = (methodName: string) => {
    const lower = methodName.toLowerCase();
    return lower.includes('crédito') || lower.includes('débito') || lower.includes('cartão');
  };

  const isMethodCredit = (methodName: string) => {
    return methodName.toLowerCase().includes('crédito');
  };

  const isMethodDebit = (methodName: string) => {
    return methodName.toLowerCase().includes('débito');
  };

  // Get applicable card brands for a payment method
  const getApplicableCardBrands = (methodId: string) => {
    const method = activePaymentMethods.find(m => m.id === methodId);
    if (!method) return [];
    
    if (isMethodCredit(method.name)) {
      return activeCardBrands.filter(b => b.type === 'credit' || b.type === 'both');
    }
    if (isMethodDebit(method.name)) {
      return activeCardBrands.filter(b => b.type === 'debit' || b.type === 'both');
    }
    return activeCardBrands;
  };

  // Get max installments for a payment method
  const getMaxInstallments = (methodId: string) => {
    const method = activePaymentMethods.find(m => m.id === methodId);
    if (!method) return 1;
    if (isMethodDebit(method.name)) return 1;
    return method.max_installments || 12;
  };

  // Calculate fee for a payment
  const calculateFee = (payment: typeof payments[0], amount: number) => {
    if (!payment.cardBrandId) return { feePercentage: 0, feeAmount: 0, netAmount: amount };
    
    const cardBrand = activeCardBrands.find(b => b.id === payment.cardBrandId);
    if (!cardBrand) return { feePercentage: 0, feeAmount: 0, netAmount: amount };

    const fees = cardBrand.fees || [];
    const installments = payment.installments || 1;
    
    const sortedFees = [...fees].sort((a, b) => b.installment_number - a.installment_number);
    const matchingFee = sortedFees.find(f => f.installment_number <= installments);
    
    const feePercentage = matchingFee?.fee_percentage || 0;
    const feeAmount = (amount * feePercentage) / 100;
    const netAmount = cardBrand.fee_behavior === 'deduct_from_provider'
      ? amount - feeAmount
      : amount;

    return { feePercentage, feeAmount, netAmount };
  };

  // Initialize edit form when appointment changes or edit mode is activated
  useEffect(() => {
    if (appointment && isEditing) {
      const startDate = new Date(appointment.start_time);
      const endDate = new Date(appointment.end_time);
      setEditDate(format(startDate, 'yyyy-MM-dd'));
      setEditStartTime(format(startDate, 'HH:mm'));
      setEditEndTime(format(endDate, 'HH:mm'));
      setEditProfessionalId(appointment.professional_id || null);
      setEditRoomId(appointment.room_id || null);
      setEditNotes(appointment.notes || '');
    }
  }, [appointment, isEditing]);

  // Reset edit mode when dialog closes
  useEffect(() => {
    if (!open) {
      setIsEditing(false);
    }
  }, [open]);

  // Calculate total fees that should be added to client payment
  const totalFeesToAddToClient = useMemo(() => {
    if (!appointment) return 0;
    return payments.reduce((sum, payment) => {
      const paymentAmount = parseFloat(payment.amount) || 0;
      if (!payment.cardBrandId || paymentAmount <= 0) return sum;
      
      const cardBrand = activeCardBrands.find(b => b.id === payment.cardBrandId);
      if (!cardBrand || cardBrand.fee_behavior !== 'add_to_client') return sum;
      
      const feeInfo = calculateFee(payment, paymentAmount);
      return sum + feeInfo.feeAmount;
    }, 0);
  }, [payments, activeCardBrands, appointment]);

  if (!appointment) return null;

  // Get package session info
  const getPackageSessionInfo = () => {
    if (!appointment.package_appointment?.package) return null;
    const pkg = appointment.package_appointment.package;
    const totalSessions = pkg.total_sessions || 0;
    const scheduledSessions = pkg.sessions_scheduled || 0;
    // After deleting, one more session will be available
    const remainingSessions = totalSessions - scheduledSessions + 1;
    return { totalSessions, scheduledSessions, remainingSessions, packageName: pkg.name };
  };

  const packageSessionInfo = getPackageSessionInfo();
  
  const handleDelete = async () => {
    if (deleteMode === 'all' && appointment.package_appointment?.package_id) {
      deletePackageAppointments.mutate(appointment.package_appointment.package_id, {
        onSuccess: () => {
          setShowDeleteDialog(false);
          onOpenChange(false);
        },
      });
    } else {
      deleteAppointment.mutate(appointment.id, {
        onSuccess: () => {
          setShowDeleteDialog(false);
          setShowRescheduleOption(false);
          onOpenChange(false);
        },
      });
    }
  };

  const handleRescheduleAndDelete = async () => {
    if (!rescheduleDate || !rescheduleTime || !appointment.package_appointment) return;
    
    const newStartTime = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
    const duration = new Date(appointment.end_time).getTime() - new Date(appointment.start_time).getTime();
    const newEndTime = new Date(newStartTime.getTime() + duration);
    
    // First update the appointment with the new time
    updateAppointment.mutate({
      id: appointment.id,
      updates: {
        start_time: newStartTime.toISOString(),
        end_time: newEndTime.toISOString(),
        status: 'scheduled',
      },
    }, {
      onSuccess: () => {
        setShowDeleteDialog(false);
        setShowRescheduleOption(false);
        setRescheduleDate('');
        setRescheduleTime('');
        onOpenChange(false);
        toast.success('Agendamento reagendado com sucesso!');
      },
    });
  };

  const handleOpenDeleteDialog = (mode: 'single' | 'all') => {
    setDeleteMode(mode);
    setShowRescheduleOption(false);
    setRescheduleDate('');
    setRescheduleTime('');
    setShowDeleteDialog(true);
  };

  const handleStatusChange = (newStatus: AppointmentStatus) => {
    setSelectedStatus(newStatus);
    updateAppointment.mutate({
      id: appointment.id,
      updates: { status: newStatus },
    });
  };

  const handleSaveEdit = () => {
    const newStartTime = new Date(`${editDate}T${editStartTime}:00`);
    const newEndTime = new Date(`${editDate}T${editEndTime}:00`);
    
    updateAppointment.mutate({
      id: appointment.id,
      updates: {
        start_time: newStartTime.toISOString(),
        end_time: newEndTime.toISOString(),
        professional_id: editProfessionalId,
        room_id: editRoomId,
        notes: editNotes || undefined,
      },
    }, {
      onSuccess: () => {
        setIsEditing(false);
      },
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const professionalId = appointment.professional_id || appointment.service?.professional_id;
  const professional = professionals.find(p => p.id === professionalId) || appointment.service?.professional;
  const status = statusConfig[appointment.status];
  
  // Check if this is a package appointment that's already paid
  const isPackageAppointment = !!appointment.package_appointment;
  const packageData = appointment.package_appointment?.package;
  
  // For package appointments, check if the package was actually paid
  // A package is paid when payment_methods are set and total_price > 0 implies it was sold
  const isPackagePaid = isPackageAppointment && packageData?.payment_methods && packageData.payment_methods.length > 0;
  
  // Check if this appointment used a pre-paid service (from caixa sale)
  // Only consider prepaid if it's marked as paid AND has payment methods or explicitly amount_paid equals price
  const isPrepaidService = !isPackageAppointment && appointment.payment_status === 'paid' && (
    (appointment.payment_methods && appointment.payment_methods.length > 0) ||
    (appointment.amount_paid || 0) > 0
  );
  
  // Calculate prices based on appointment type
  // IMPORTANT: For package appointments, the total price to pay is the FULL PACKAGE PRICE, not per session
  // Packages must be paid in full, regardless of how many sessions are scheduled
  const servicePrice = appointment.service?.price || 0;
  const packagePrice = packageData?.total_price || 0;
  
  const totalPrice = isPackageAppointment 
    ? (isPackagePaid ? 0 : packagePrice)
    : servicePrice;
  
  // Calculate amount paid based on actual data
  // For packages: if paid, show full package price as paid. If not paid, show appointment's amount_paid
  // For regular services: show the actual amount_paid from the appointment
  const amountPaid = isPackageAppointment 
    ? (isPackagePaid ? packagePrice : (appointment.amount_paid || 0))
    : (appointment.amount_paid || 0);
  
  const remainingAmount = Math.max(0, totalPrice - amountPaid);
  
  // Determine effective payment status based on actual amounts
  // This ensures consistency between displayed status and values
  const calculateEffectivePaymentStatus = () => {
    if (isPackagePaid) return 'paid';
    if (totalPrice === 0) return 'paid';
    if (amountPaid >= totalPrice) return 'paid';
    if (amountPaid > 0) return 'partial';
    return 'pending';
  };
  
  const effectivePaymentStatus = calculateEffectivePaymentStatus();
  const paymentStatus = paymentStatusConfig[effectivePaymentStatus];
  const PaymentIcon = paymentStatus.icon;

  const addPaymentMethod = () => {
    setPayments([...payments, { method: '', amount: '' }]);
  };

  const removePaymentMethod = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  const updatePayment = (index: number, field: 'method' | 'amount', value: string) => {
    const newPayments = [...payments];
    if (field === 'method') {
      // Reset card-related fields when method changes
      newPayments[index] = { 
        ...newPayments[index], 
        method: value,
        methodId: undefined,
        cardBrandId: undefined,
        installments: 1
      };
    } else {
      newPayments[index][field] = value;
    }
    setPayments(newPayments);
  };

  const totalPaymentAmount = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const clientCredit = parseFloat(clientCreditAmount) || 0;
  
  const totalWithCredit = totalPaymentAmount + clientCredit;
  const totalWithFees = totalWithCredit + totalFeesToAddToClient;
  const newRemainingAmount = remainingAmount - totalPaymentAmount - clientCredit;
  const hasPartialPayment = newRemainingAmount > 0 && totalWithCredit > 0;
  
  // Calculate excess payment (when paid more than owed)
  const excessPaymentAmount = totalPaymentAmount > remainingAmount ? totalPaymentAmount - remainingAmount : 0;
  const hasExcessPayment = excessPaymentAmount > 0;

  const handleConfirmPayment = () => {
    // Verificar se existe caixa aberto
    if (!currentOpenRegister) {
      toast.error('É necessário abrir o caixa antes de registrar pagamentos!');
      return;
    }
    
    // If there's excess payment, require user to choose what to do with it
    if (hasExcessPayment && !excessAction) {
      toast.error('Selecione o destino do valor excedente (crédito ou troco)');
      return;
    }
    
    // If change was selected, require payment method
    if (hasExcessPayment && excessAction === 'change' && !changePaymentMethodId) {
      toast.error('Selecione a forma de devolução do troco');
      return;
    }
    
    if (hasPartialPayment) {
      setShowConfirmDialog(true);
    } else {
      submitPayment();
    }
  };

  const submitPayment = () => {
    const validPayments = payments
      .filter(p => p.amount && parseFloat(p.amount) > 0)
      .map(p => ({ 
        method: p.methodId || p.method, 
        amount: parseFloat(p.amount),
        cardBrandId: p.cardBrandId,
        installments: p.installments
      }));

    // If excess payment should become client credit, add it to the credit amount
    const finalClientCredit = excessAction === 'credit' 
      ? (clientCredit + excessPaymentAmount) 
      : clientCredit;

    if (validPayments.length > 0 || finalClientCredit > 0) {
      onPayment(
        appointment.id, 
        validPayments, 
        finalClientCredit > 0 ? finalClientCredit : undefined,
        currentOpenRegister?.id
      );
      setShowPaymentForm(false);
      setPayments([{ method: '', amount: '' }]);
      setClientCreditAmount('');
      setShowConfirmDialog(false);
      setExcessAction(null);
      setChangePaymentMethodId(null);
      
      // Show toast about excess handling
      if (hasExcessPayment && excessAction === 'credit') {
        toast.success(`R$ ${excessPaymentAmount.toFixed(2)} adicionado como crédito do cliente`);
      } else if (hasExcessPayment && excessAction === 'change') {
        const changeMethod = activePaymentMethods.find(m => m.id === changePaymentMethodId);
        toast.info(`Troco de R$ ${excessPaymentAmount.toFixed(2)} devolvido via ${changeMethod?.name || 'dinheiro'}`);
      }
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              {isPackageAppointment ? (
                <Package className="h-5 w-5 text-primary" />
              ) : (
                <Sparkles className="h-5 w-5 text-primary" />
              )}
              {isPackageAppointment 
                ? packageData?.name || 'Sessão de Pacote'
                : appointment.service?.name || 'Serviço'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
            {/* Client Info */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <User className="h-5 w-5 mt-0.5 text-primary" />
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{appointment.client?.name}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  {appointment.client?.phone}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && !isEditing && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsEditing(true)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                )}
                <Select value={appointment.status} onValueChange={(v) => handleStatusChange(v as AppointmentStatus)}>
                  <SelectTrigger className={cn('w-auto h-7 text-xs', status.className)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Agendado</SelectItem>
                    <SelectItem value="confirmed">Confirmado</SelectItem>
                    <SelectItem value="completed">Atendido</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                    <SelectItem value="missed">Faltou</SelectItem>
                    <SelectItem value="rescheduled">Reagendado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Edit Mode */}
            {isEditing ? (
              <div className="space-y-4 p-4 rounded-lg border border-primary/30 bg-primary/5">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold flex items-center gap-2 text-primary">
                    <Edit className="h-4 w-4" />
                    Editar Agendamento
                  </h4>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Data</Label>
                    <Input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Início</Label>
                    <Input
                      type="time"
                      value={editStartTime}
                      onChange={(e) => setEditStartTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Fim</Label>
                    <Input
                      type="time"
                      value={editEndTime}
                      onChange={(e) => setEditEndTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Profissional</Label>
                    <Select value={editProfessionalId || 'none'} onValueChange={(v) => setEditProfessionalId(v === 'none' ? null : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                        {professionals.filter(p => p.is_active).map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Sala</Label>
                    <Select value={editRoomId || 'none'} onValueChange={(v) => setEditRoomId(v === 'none' ? null : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {rooms.filter(r => r.is_active).map(r => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Observações</Label>
                  <Textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Adicione observações..."
                    rows={2}
                  />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleCancelEdit} className="flex-1">
                    <X className="h-4 w-4 mr-1" />
                    Cancelar
                  </Button>
                  <Button onClick={handleSaveEdit} className="flex-1" disabled={updateAppointment.isPending}>
                    <Save className="h-4 w-4 mr-1" />
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              /* Service Info - View Mode */
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{appointment.service?.name}</p>
                    <p className="text-sm text-muted-foreground">{appointment.service?.category}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{format(new Date(appointment.start_time), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
                </div>

                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {format(new Date(appointment.start_time), 'HH:mm')} - {format(new Date(appointment.end_time), 'HH:mm')}
                    <span className="text-muted-foreground ml-1">({appointment.service?.duration} min)</span>
                  </span>
                </div>

                {professional && (
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div className="flex items-center gap-2">
                      <span>{professional.name}</span>
                      {professional.agenda_color && (
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: professional.agenda_color }}
                        />
                      )}
                    </div>
                  </div>
                )}

                {(appointment.room || appointment.service?.room) && (
                  <div className="flex items-center gap-3">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{appointment.room?.name || appointment.service?.room?.name}</span>
                  </div>
                )}
              </div>
            )}

            <Separator />

            {/* Payment Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Pagamento
                </h4>
                <div className={cn('flex items-center gap-1.5', paymentStatus.className)}>
                  <PaymentIcon className="h-4 w-4" />
                  <span className="text-sm font-medium">{paymentStatus.label}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="text-xs text-muted-foreground">Valor Total</p>
                  <p className="font-semibold">R$ {totalPrice.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor Pago</p>
                  <p className="font-semibold text-success">R$ {amountPaid.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Restante</p>
                  <p className={cn('font-semibold', remainingAmount > 0 ? 'text-warning' : 'text-success')}>
                    R$ {remainingAmount.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Package payment indicator - packages must be paid in full */}
              {isPackageAppointment && !isPackagePaid && remainingAmount > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <Package className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-primary">Pagamento de Pacote</p>
                    <p className="text-xs text-muted-foreground">
                      O valor total do pacote é <strong>R$ {(packageData?.total_price || 0).toFixed(2)}</strong> e deve ser pago integralmente.
                    </p>
                  </div>
                </div>
              )}

              {/* Prepaid Service Indicator */}
              {isPrepaidService && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
                  <Gift className="h-4 w-4 text-success flex-shrink-0" />
                  <p className="text-sm text-success">
                    Serviço pré-pago via caixa
                  </p>
                </div>
              )}

              {/* Package already paid indicator */}
              {isPackagePaid && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
                  <Package className="h-4 w-4 text-success flex-shrink-0" />
                  <p className="text-sm text-success">
                    Pacote já foi pago integralmente
                  </p>
                </div>
              )}

              {/* Outstanding Balance Warning */}
              {remainingAmount > 0 && !showPaymentForm && !isPrepaidService && !isPackagePaid && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
                  <p className="text-sm text-warning">
                    Este agendamento possui um valor em aberto de <strong>R$ {remainingAmount.toFixed(2)}</strong>
                  </p>
                </div>
              )}

              {/* Existing Payments */}
              {appointment.payment_methods && appointment.payment_methods.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {appointment.payment_methods.map((method, i) => (
                    <Badge key={i} variant="secondary">
                      <CreditCard className="h-3 w-3 mr-1" />
                      {activePaymentMethods.find(p => p.id === method)?.name || method}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Payment Form */}
              {showPaymentForm ? (
                <div className="space-y-3 p-3 rounded-lg border border-border">
                  {/* Client credit balance indicator */}
                  {appointment.client?.credit_balance && appointment.client.credit_balance > 0 && (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Gift className="h-4 w-4 text-amber-500" />
                          <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                            Crédito disponível do cliente
                          </span>
                        </div>
                        <span className="text-lg font-bold text-amber-600">
                          R$ {appointment.client.credit_balance.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        O cliente possui crédito que pode ser utilizado neste pagamento.
                      </p>
                    </div>
                  )}

                  {/* Total to pay header */}
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <p className="text-sm text-muted-foreground">Valor a pagar</p>
                    <p className="text-xl font-bold text-primary">R$ {remainingAmount.toFixed(2)}</p>
                    {isPackageAppointment && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Valor total do pacote (pagamento integral obrigatório)
                      </p>
                    )}
                  </div>
                  
                  <p className="text-sm font-medium">Registrar Pagamento</p>
                  
                  {payments.map((payment, index) => {
                    const selectedMethod = activePaymentMethods.find(m => m.id === payment.methodId);
                    const isCard = selectedMethod ? isMethodCard(selectedMethod.name) : false;
                    const isCredit = selectedMethod ? isMethodCredit(selectedMethod.name) : false;
                    const applicableBrands = payment.methodId ? getApplicableCardBrands(payment.methodId) : [];
                    const maxInstallments = payment.methodId ? getMaxInstallments(payment.methodId) : 1;
                    const paymentAmount = parseFloat(payment.amount) || 0;
                    const feeInfo = calculateFee(payment, paymentAmount);
                    const selectedBrand = activeCardBrands.find(b => b.id === payment.cardBrandId);

                    return (
                      <div key={index} className="space-y-2 p-3 rounded-lg border bg-muted/30">
                        <div className="flex gap-2 items-end">
                          <div className="flex-1">
                            <Label className="text-xs">Forma de Pagamento</Label>
                            <Select
                              value={payment.methodId || ''}
                              onValueChange={(value) => {
                                const newPayments = [...payments];
                                newPayments[index] = { 
                                  ...newPayments[index], 
                                  methodId: value, 
                                  method: activePaymentMethods.find(m => m.id === value)?.name || value,
                                  cardBrandId: undefined,
                                  installments: 1
                                };
                                setPayments(newPayments);
                              }}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                              <SelectContent>
                                {activePaymentMethods.map(m => (
                                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex-1">
                            <Label className="text-xs">Valor (R$)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0,00"
                              value={payment.amount}
                              onChange={(e) => updatePayment(index, 'amount', e.target.value)}
                            />
                          </div>
                          {payments.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => removePaymentMethod(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        {/* Card Brand and Installments - Only for card payments */}
                        {isCard && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Bandeira</Label>
                              <Select
                                value={payment.cardBrandId || ''}
                                onValueChange={(value) => {
                                  const newPayments = [...payments];
                                  newPayments[index] = { ...newPayments[index], cardBrandId: value };
                                  setPayments(newPayments);
                                }}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {applicableBrands.map(b => (
                                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {isCredit && maxInstallments > 1 && (
                              <div>
                                <Label className="text-xs">Parcelas</Label>
                                <Select
                                  value={(payment.installments || 1).toString()}
                                  onValueChange={(value) => {
                                    const newPayments = [...payments];
                                    newPayments[index] = { ...newPayments[index], installments: parseInt(value) };
                                    setPayments(newPayments);
                                  }}
                                >
                                  <SelectTrigger className="h-9">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: maxInstallments }, (_, i) => i + 1).map(n => (
                                      <SelectItem key={n} value={n.toString()}>
                                        {n}x {paymentAmount > 0 && `R$ ${(paymentAmount / n).toFixed(2)}`}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Fee Info */}
                        {selectedBrand && feeInfo.feePercentage > 0 && (
                          <div className="flex flex-wrap items-center gap-2 text-xs p-2 rounded bg-muted/50">
                            <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                              Taxa: {feeInfo.feePercentage.toFixed(2)}%
                            </Badge>
                            <span className="text-muted-foreground">
                              R$ {feeInfo.feeAmount.toFixed(2)}
                            </span>
                            {selectedBrand.fee_behavior === 'deduct_from_provider' && (
                              <span className="text-muted-foreground">
                                • Líquido: <strong>R$ {feeInfo.netAmount.toFixed(2)}</strong>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <Button variant="outline" size="sm" onClick={addPaymentMethod} className="w-full">
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar forma de pagamento
                  </Button>

                  {/* Client Credit Section - Admin Only */}
                  {canAddClientCredit && (
                    <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                      <div className="flex items-center gap-2 mb-2">
                        <Gift className="h-4 w-4 text-amber-500" />
                        <Label className="text-sm font-medium text-amber-700 dark:text-amber-400">
                          Crédito ao Cliente
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        O valor não será contabilizado como recebimento, ficará como crédito do cliente.
                      </p>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        value={clientCreditAmount}
                        onChange={(e) => setClientCreditAmount(e.target.value)}
                      />
                    </div>
                  )}

                  {/* Payment summary */}
                  {(totalPaymentAmount > 0 || clientCredit > 0) && (
                    <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                      {totalPaymentAmount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span>Valor do serviço:</span>
                          <span className="font-semibold">R$ {totalPaymentAmount.toFixed(2)}</span>
                        </div>
                      )}
                      {totalFeesToAddToClient > 0 && (
                        <div className="flex justify-between text-sm text-amber-600">
                          <span>Taxa de cartão:</span>
                          <span className="font-semibold">+ R$ {totalFeesToAddToClient.toFixed(2)}</span>
                        </div>
                      )}
                      {clientCredit > 0 && (
                        <div className="flex justify-between text-sm">
                          <span>Crédito ao cliente:</span>
                          <span className="font-semibold text-amber-500">R$ {clientCredit.toFixed(2)}</span>
                        </div>
                      )}
                      <Separator className="my-1" />
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Total a cobrar do cliente:</span>
                        <span className="font-bold text-primary">R$ {totalWithFees.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Valor quitado do serviço:</span>
                        <span className="font-semibold text-success">R$ {totalWithCredit.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Restante do serviço:</span>
                        <span className={cn('font-semibold', newRemainingAmount > 0 ? 'text-warning' : 'text-success')}>
                          R$ {newRemainingAmount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Partial payment warning */}
                  {hasPartialPayment && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
                      <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
                      <p className="text-xs text-warning">
                        Ficará um valor em aberto de R$ {newRemainingAmount.toFixed(2)}
                      </p>
                    </div>
                  )}

                  {/* Excess payment handling - when amount paid > amount owed */}
                  {hasExcessPayment && (
                    <div className="p-3 rounded-lg border border-success/30 bg-success/5 space-y-3">
                      <div className="flex items-center gap-2 text-success">
                        <Gift className="h-4 w-4" />
                        <span className="font-medium text-sm">
                          Valor excedente: R$ {excessPaymentAmount.toFixed(2)}
                        </span>
                      </div>
                      
                      <p className="text-xs text-muted-foreground">
                        O valor pago é maior que o valor a pagar. Escolha o destino do excedente:
                      </p>
                      
                      <div className="flex gap-2">
                        <Button
                          variant={excessAction === 'credit' ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setExcessAction('credit');
                            setChangePaymentMethodId(null);
                          }}
                        >
                          <Gift className="h-4 w-4 mr-1" />
                          Crédito Cliente
                        </Button>
                        <Button
                          variant={excessAction === 'change' ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1"
                          onClick={() => setExcessAction('change')}
                        >
                          <DollarSign className="h-4 w-4 mr-1" />
                          Troco
                        </Button>
                      </div>

                      {excessAction === 'credit' && (
                        <div className="text-xs text-success bg-success/10 p-2 rounded">
                          R$ {excessPaymentAmount.toFixed(2)} será adicionado como crédito para o cliente usar em próximos atendimentos.
                        </div>
                      )}

                      {excessAction === 'change' && (
                        <div className="space-y-2">
                          <Label className="text-xs">Como será devolvido o troco?</Label>
                          <Select
                            value={changePaymentMethodId || ''}
                            onValueChange={setChangePaymentMethodId}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                              {activePaymentMethods
                                .filter(m => m.name.toLowerCase().includes('dinheiro') || m.name.toLowerCase().includes('pix'))
                                .map(m => (
                                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowPaymentForm(false)} className="flex-1">
                      Cancelar
                    </Button>
                    <Button onClick={handleConfirmPayment} className="flex-1" disabled={totalWithCredit <= 0}>
                      Confirmar Pagamento
                    </Button>
                  </div>
                </div>
              ) : remainingAmount > 0 ? (
                <Button onClick={() => setShowPaymentForm(true)} className="w-full">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Dar Baixa no Pagamento
                </Button>
              ) : null}
            </div>

            {/* Notes */}
            {appointment.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-1">Observações</p>
                  <p className="text-sm text-muted-foreground">{appointment.notes}</p>
                </div>
              </>
            )}

            {/* Created/Updated By Info */}
            <Separator />
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-1">
                <History className="h-3 w-3" />
                <span>
                  Criado em {format(new Date(appointment.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  {appointment.created_by_profile && ` por ${appointment.created_by_profile.full_name}`}
                </span>
              </div>
              {appointment.updated_by_profile && (
                <div className="flex items-center gap-1">
                  <Edit className="h-3 w-3" />
                  <span>
                    Editado em {format(new Date(appointment.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    {` por ${appointment.updated_by_profile.full_name}`}
                  </span>
                </div>
              )}
            </div>

            {/* Delete Button */}
            {canDelete && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="w-full"
                    onClick={() => handleOpenDeleteDialog('single')}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir Este Agendamento
                  </Button>
                  {isPackageAppointment && packageData && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() => handleOpenDeleteDialog('all')}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir Todos do Pacote ({packageData.name})
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              {deleteMode === 'all' ? 'Excluir Todos os Agendamentos do Pacote' : 'Excluir Agendamento'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                {deleteMode === 'all' ? (
                  <p>
                    Tem certeza que deseja excluir <strong>todos os agendamentos</strong> do pacote <strong>{packageData?.name}</strong> de <strong>{appointment.client?.name}</strong>? 
                    <br /><br />
                    Esta ação irá remover todos os agendamentos vinculados a este pacote e resetar as sessões. Esta ação não pode ser desfeita.
                  </p>
                ) : (
                  <>
                    <p>
                      Tem certeza que deseja excluir este agendamento de <strong>{appointment.client?.name}</strong>
                      {appointment.service?.name ? ` para ${appointment.service.name}` : packageData?.name ? ` (Pacote: ${packageData.name})` : ''}? 
                    </p>
                    
                    {/* Payment warning - show when appointment has payments */}
                    {amountPaid > 0 && (
                      <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                        <div className="flex items-center gap-2 text-destructive font-medium mb-2">
                          <AlertTriangle className="h-4 w-4" />
                          <span>Atenção: Este agendamento possui pagamento registrado!</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Ao excluir este agendamento, o valor de <strong className="text-destructive">R$ {amountPaid.toFixed(2)}</strong> será removido do caixa e do financeiro.
                        </p>
                      </div>
                    )}
                    
                    {/* Package session info */}
                    {isPackageAppointment && packageSessionInfo && (
                      <div className="p-3 rounded-lg bg-info/10 border border-info/20">
                        <div className="flex items-center gap-2 text-info font-medium mb-2">
                          <Gift className="h-4 w-4" />
                          <span>Sessão de Pacote</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Após excluir, a sessão será liberada para reagendamento.
                        </p>
                        <div className="mt-2 flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1">
                            <span className="font-medium text-foreground">{packageSessionInfo.remainingSessions}</span>
                            <span className="text-muted-foreground">sessões disponíveis</span>
                          </span>
                          <span className="text-muted-foreground">de {packageSessionInfo.totalSessions} total</span>
                        </div>
                      </div>
                    )}

                    {/* Reschedule option for package appointments */}
                    {isPackageAppointment && !showRescheduleOption && (
                      <Button
                        variant="outline"
                        className="w-full border-primary text-primary hover:bg-primary/10"
                        onClick={() => setShowRescheduleOption(true)}
                      >
                        <Calendar className="h-4 w-4 mr-2" />
                        Reagendar em vez de excluir
                      </Button>
                    )}

                    {showRescheduleOption && (
                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
                        <div className="flex items-center gap-2 text-primary font-medium">
                          <Calendar className="h-4 w-4" />
                          <span>Reagendar para:</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Data</Label>
                            <Input
                              type="date"
                              value={rescheduleDate}
                              onChange={(e) => setRescheduleDate(e.target.value)}
                              min={format(new Date(), 'yyyy-MM-dd')}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Horário</Label>
                            <Input
                              type="time"
                              value={rescheduleTime}
                              onChange={(e) => setRescheduleTime(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              setShowRescheduleOption(false);
                              setRescheduleDate('');
                              setRescheduleTime('');
                            }}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1"
                            disabled={!rescheduleDate || !rescheduleTime || updateAppointment.isPending}
                            onClick={handleRescheduleAndDelete}
                          >
                            Confirmar Reagendamento
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {!showRescheduleOption && (
              <AlertDialogAction 
                onClick={handleDelete} 
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteAppointment.isPending || deletePackageAppointments.isPending}
              >
                {deleteMode === 'all' ? 'Excluir Todos' : 'Excluir'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Partial Payment Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Pagamento Parcial
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Você está registrando um pagamento parcial. Após confirmar, ficará um valor em aberto de:
              </p>
              <p className="text-2xl font-bold text-warning text-center py-2">
                R$ {newRemainingAmount.toFixed(2)}
              </p>
              <p>
                Deseja continuar com o registro do pagamento parcial?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={submitPayment}>
              Confirmar Pagamento Parcial
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
