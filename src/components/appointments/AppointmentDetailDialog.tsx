import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Calendar as DatePickerCalendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchableSelect } from '@/components/ui/searchable-select';
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
  Edit,
  History,
  Save,
  X,
  ExternalLink,
} from 'lucide-react';
import { Appointment, Professional, Room, AppointmentStatus } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useAppointments } from '@/hooks/useAppointments';
import { useRecurringAppointments } from '@/hooks/useRecurringAppointments';
import { useRooms } from '@/hooks/useRooms';
import { useServices } from '@/hooks/useServices';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useCardBrands } from '@/hooks/useCardBrands';
import { useCashRegisters } from '@/hooks/useCashRegisters';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { appointmentStatusConfig } from '@/lib/appointmentStatus';

interface AppointmentDetailDialogProps {
  appointment: Appointment | null;
  professionals: Professional[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPayment: (
    appointmentId: string, 
    paymentMethods: { method: string; amount: number; cardBrandId?: string; installments?: number }[], 
    clientCredit?: number, // Saldo: troco real que fica no caixa
    courtesyCredit?: number, // Cortesia: brinde sem entrada financeira
    cashRegisterId?: string,
    usedClientCredit?: number,
    discountApplied?: number, // Desconto aplicado
    usedClientCreditMethod?: string
  ) => void;
}

const statusConfig = appointmentStatusConfig;

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
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const { updateAppointment, deleteAppointment, deletePackageAppointments } = useAppointments();
  const { deleteAppointmentSeries, getSeriesAppointments, propagateSeriesDates } = useRecurringAppointments();
  const { rooms } = useRooms();
  const { activeServices } = useServices();
  const { activePaymentMethods } = usePaymentMethods();
  const { activeCardBrands } = useCardBrands();
  const { currentOpenRegister } = useCashRegisters();
  
  // Early return moved AFTER all hooks for React Rules of Hooks compliance
  const canAddClientCredit = hasRole('admin');
  const canDelete = hasRole('admin');
  const canEdit = hasRole('admin') || hasRole('receptionist');
  
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payments, setPayments] = useState<{ method: string; methodId?: string; cardBrandId?: string; installments?: number; amount: string }[]>([
    { method: '', amount: '' },
  ]);
  // Removed courtesyCreditAmount - courtesy payment feature removed
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showClientProfileDialog, setShowClientProfileDialog] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'single' | 'all'>('single');
  const [recurringDeleteType, setRecurringDeleteType] = useState<'single' | 'following' | 'all'>('single');
  const [showRescheduleOption, setShowRescheduleOption] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<AppointmentStatus | ''>('');
  const [seriesCount, setSeriesCount] = useState(0);
  const [seriesIndex, setSeriesIndex] = useState(0);
  
  // Excess payment handling (when amount paid > amount owed)
  const [excessAction, setExcessAction] = useState<'credit' | 'change' | null>(null);
  const [changePaymentMethodId, setChangePaymentMethodId] = useState<string | null>(null);
  
  // Client credit usage (use existing credit balance)
  const [useClientCredit, setUseClientCredit] = useState(false);
  const [clientCreditUsedAmount, setClientCreditUsedAmount] = useState('');
  
  // Discount
  const [discountAmount, setDiscountAmount] = useState('');
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editServiceId, setEditServiceId] = useState<string | null>(null);
  const [editProfessionalId, setEditProfessionalId] = useState<string | null>(null);
  const [editRoomId, setEditRoomId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [propagateDates, setPropagateDates] = useState(false); // New: propagate dates to following appointments

  // Helper function to check if payment method is card
  const isMethodCard = (methodName: string) => {
    if (isClientCreditMethod(methodName)) return false;
    const lower = methodName.toLowerCase();
    return lower.includes('crédito') || lower.includes('débito') || lower.includes('cartão');
  };

  const isMethodCredit = (methodName: string) => {
    if (isClientCreditMethod(methodName)) return false;
    return methodName.toLowerCase().includes('crédito');
  };

  const isClientCreditMethod = (methodName: string) => {
    const lower = methodName.toLowerCase();
    return lower.includes('crédito') && lower.includes('cliente');
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
      setEditServiceId(appointment.service_id || null);
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

  // Load series info - MUST be before any early returns
  const [localSeriesCount, setLocalSeriesCount] = useState(0);
  const [localSeriesIndex, setLocalSeriesIndex] = useState(0);
  
  useEffect(() => {
    const loadSeriesInfoAsync = async () => {
      if (!open || !appointment?.recurring_group_id) {
        setLocalSeriesCount(0);
        setLocalSeriesIndex(0);
        return;
      }
      
      try {
        const seriesAppointments = await getSeriesAppointments(appointment.recurring_group_id);
        setLocalSeriesCount(seriesAppointments?.length || 0);
        const index = seriesAppointments?.findIndex(a => a.id === appointment.id) ?? -1;
        setLocalSeriesIndex(index + 1);
      } catch (error) {
        console.error('Error loading series info:', error);
      }
    };
    
    loadSeriesInfoAsync();
  }, [open, appointment?.recurring_group_id, appointment?.id, getSeriesAppointments]);
  
  // Sync local series state to component state
  useEffect(() => {
    setSeriesCount(localSeriesCount);
    setSeriesIndex(localSeriesIndex);
  }, [localSeriesCount, localSeriesIndex]);

  // Early return for null appointment - AFTER all hooks
  if (!appointment) {
    return null;
  }
  
  // Safely access nested properties with fallbacks
  const safeClient = appointment.client || { name: 'Cliente não encontrado', phone: '', credit_balance: 0 };
  const safeService = appointment.service || { name: 'Serviço não disponível', price: 0, professional: null, room: null };

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
  
  // Check if appointment is part of a recurring series
  const isRecurringSeries = appointment.recurring_group_id != null;

  const handleDelete = async () => {
    // Handle package appointments (delete all from package)
    if (deleteMode === 'all' && appointment.package_appointment?.package_id) {
      deletePackageAppointments.mutate(appointment.package_appointment.package_id, {
        onSuccess: () => {
          setShowDeleteDialog(false);
          onOpenChange(false);
        },
      });
    } 
    // Handle recurring appointments
    else if (isRecurringSeries && recurringDeleteType !== 'single') {
      try {
        await deleteAppointmentSeries.mutateAsync({
          recurring_group_id: appointment.recurring_group_id!,
          appointment_id: appointment.id,
          delete_type: recurringDeleteType,
          send_whatsapp: false,
          client_phone: appointment.client?.phone,
          client_name: appointment.client?.name,
        });
        setShowDeleteDialog(false);
        onOpenChange(false);
      } catch (error) {
        console.error('Error deleting recurring series:', error);
      }
    }
    // Handle single appointment
    else {
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

  const selectedEditService = activeServices.find((service) => service.id === editServiceId) || appointment.service;

  const recalculateEndTime = (startValue: string, serviceDuration = selectedEditService?.duration || 0) => {
    if (!editDate || !startValue || serviceDuration <= 0) return;

    const newStartTime = new Date(`${editDate}T${startValue}:00`);
    const newEndTime = new Date(newStartTime.getTime() + serviceDuration * 60000);
    setEditEndTime(format(newEndTime, 'HH:mm'));
  };

  const handleEditStartTimeChange = (value: string) => {
    setEditStartTime(value);
    recalculateEndTime(value);
  };

  const handleEditServiceChange = (serviceId: string) => {
    const service = activeServices.find((item) => item.id === serviceId);
    setEditServiceId(serviceId || null);
    if (service?.professional_id) setEditProfessionalId(service.professional_id);
    if (service?.room_id) setEditRoomId(service.room_id);
    if (editStartTime && service?.duration) recalculateEndTime(editStartTime, service.duration);
  };

  const handleOpenClientProfile = () => {
    if (!appointment.client_id) return;
    setShowClientProfileDialog(false);
    onOpenChange(false);
    navigate(`/clientes/${appointment.client_id}`, {
      state: {
        returnToAgendaAppointmentId: appointment.id,
        returnToAgendaDate: appointment.start_time,
      },
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
          service_id: editServiceId,
        professional_id: editProfessionalId,
        room_id: editRoomId,
        notes: editNotes || undefined,
      },
    }, {
      onSuccess: () => {
        // Check if we need to propagate dates to following appointments
        if (propagateDates) {
          const isPackageApt = !!appointment.package_appointment;
          const isRecurringApt = !!appointment.recurring_group_id;
          
          if (isRecurringApt) {
            propagateSeriesDates.mutate({
              appointment_id: appointment.id,
              new_start_time: newStartTime,
              new_end_time: newEndTime,
              propagate_type: 'recurring',
              recurring_group_id: appointment.recurring_group_id!,
            });
          } else if (isPackageApt && appointment.package_appointment?.package_id) {
            propagateSeriesDates.mutate({
              appointment_id: appointment.id,
              new_start_time: newStartTime,
              new_end_time: newEndTime,
              propagate_type: 'package',
              package_id: appointment.package_appointment.package_id,
            });
          }
        }
        
        setIsEditing(false);
        setPropagateDates(false);
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
      const methodName = activePaymentMethods.find(m => m.id === newPayments[index].methodId)?.name || newPayments[index].method;
      if (isClientCreditMethod(methodName)) {
        const maxCreditUse = Math.min(availableClientCredit, remainingAfterDiscount);
        const typedValue = parseFloat(value) || 0;
        newPayments[index][field] = Math.min(Math.max(typedValue, 0), maxCreditUse).toString();
      } else {
        newPayments[index][field] = value;
      }
    }
    setPayments(newPayments);
  };

  const paymentMethodCreditUsed = payments.reduce((sum, p) => {
    const methodName = activePaymentMethods.find(m => m.id === p.methodId)?.name || p.method;
    return isClientCreditMethod(methodName) ? sum + (parseFloat(p.amount) || 0) : sum;
  }, 0);
  const moneyPaymentAmount = payments.reduce((sum, p) => {
    const methodName = activePaymentMethods.find(m => m.id === p.methodId)?.name || p.method;
    return isClientCreditMethod(methodName) ? sum : sum + (parseFloat(p.amount) || 0);
  }, 0);
  const totalPaymentAmount = moneyPaymentAmount;
  const courtesyCredit = 0; // Cortesia removed
  const discount = parseFloat(discountAmount) || 0; // Desconto aplicado
  
  // Calculate credit to be used from client's available balance
  const availableClientCredit = appointment.client?.credit_balance || 0;
  
  // Remaining amount after discount
  const remainingAfterDiscount = Math.max(0, remainingAmount - discount);
  const creditLimitForPayment = Math.min(availableClientCredit, remainingAfterDiscount);
  const isClientCreditInvalid = paymentMethodCreditUsed > creditLimitForPayment;
  
  const clientCreditUsed = Math.min(
    (useClientCredit ? parseFloat(clientCreditUsedAmount) || 0 : 0) + paymentMethodCreditUsed,
    availableClientCredit,
    remainingAfterDiscount
  );
  
  const totalWithCredit = totalPaymentAmount + courtesyCredit + clientCreditUsed;
  const totalWithFees = totalWithCredit + totalFeesToAddToClient;
  const newRemainingAmount = remainingAfterDiscount - totalPaymentAmount - courtesyCredit - clientCreditUsed;
  const hasPartialPayment = newRemainingAmount > 0 && totalWithCredit > 0;
  
  // Courtesy-only check removed - courtesy feature removed
  const isCourtesyOnly = false;
  
  // Calculate excess payment (when paid more than owed)
  const excessPaymentAmount = totalPaymentAmount > remainingAfterDiscount ? totalPaymentAmount - remainingAfterDiscount : 0;
  const hasExcessPayment = excessPaymentAmount > 0;

  const handleConfirmPayment = () => {
    if (isClientCreditInvalid) {
      toast.error(`Crédito ao cliente limitado a R$ ${creditLimitForPayment.toFixed(2)} para este pagamento.`);
      return;
    }

    // For courtesy-only, we don't need cash register (no financial impact)
    if (!isCourtesyOnly && moneyPaymentAmount > 0 && !currentOpenRegister) {
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
    
    if (hasPartialPayment && !isCourtesyOnly) {
      setShowConfirmDialog(true);
    } else {
      submitPayment();
    }
  };

  const submitPayment = () => {
    const clientCreditPaymentMethod = payments.find(p => {
      const methodName = activePaymentMethods.find(m => m.id === p.methodId)?.name || p.method;
      return isClientCreditMethod(methodName) && (parseFloat(p.amount) || 0) > 0;
    });
    const validPayments = payments
      .filter(p => p.amount && parseFloat(p.amount) > 0 && !isClientCreditMethod(activePaymentMethods.find(m => m.id === p.methodId)?.name || p.method))
      .map(p => ({ 
        method: p.methodId || p.method, 
        amount: parseFloat(p.amount),
        cardBrandId: p.cardBrandId,
        installments: p.installments
      }));

    // If excess payment should become client SALDO (credit with financial registration)
    // excessAction === 'credit' means the excess becomes saldo (real money stored as credit)
    const finalClientCredit = excessAction === 'credit' ? excessPaymentAmount : undefined;
    
    // Courtesy removed - no longer send courtesyCredit
    const finalCourtesyCredit = undefined;

    if (validPayments.length > 0 || finalClientCredit || finalCourtesyCredit || clientCreditUsed > 0 || discount > 0) {
      onPayment(
        appointment.id, 
        validPayments, 
        finalClientCredit, // Saldo: troco real registrado no caixa/financeiro
        finalCourtesyCredit, // Cortesia: brinde sem entrada financeira
        currentOpenRegister?.id,
        clientCreditUsed > 0 ? clientCreditUsed : undefined,
        discount > 0 ? discount : undefined, // Desconto aplicado
        clientCreditPaymentMethod?.methodId || clientCreditPaymentMethod?.method
      );
      setShowPaymentForm(false);
      setPayments([{ method: '', amount: '' }]);
      // courtesyCreditAmount removed
      setClientCreditUsedAmount('');
      setDiscountAmount('');
      setUseClientCredit(false);
      setShowConfirmDialog(false);
      setExcessAction(null);
      setChangePaymentMethodId(null);
      
      // Show toast about credit usage
      if (clientCreditUsed > 0) {
        toast.success(`R$ ${clientCreditUsed.toFixed(2)} do saldo do cliente foi utilizado`);
      }
      
      // Show toast about excess handling
      if (hasExcessPayment && excessAction === 'credit') {
        toast.success(`R$ ${excessPaymentAmount.toFixed(2)} adicionado como saldo do cliente`);
      } else if (hasExcessPayment && excessAction === 'change') {
        const changeMethod = activePaymentMethods.find(m => m.id === changePaymentMethodId);
        toast.info(`Troco de R$ ${excessPaymentAmount.toFixed(2)} devolvido via ${changeMethod?.name || 'dinheiro'}`);
      }
      // Courtesy toast removed
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
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-lg font-semibold text-foreground"
                  onClick={() => setShowClientProfileDialog(true)}
                >
                  {appointment.client?.name}
                </Button>
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

                <div>
                  <Label className="text-xs">Serviço</Label>
                  <SearchableSelect
                    value={editServiceId || ''}
                    onChange={handleEditServiceChange}
                    placeholder="Selecione o serviço"
                    searchPlaceholder="Buscar serviço..."
                    emptyMessage="Nenhum serviço encontrado."
                    options={activeServices.map((service) => ({
                      value: service.id,
                      label: service.name,
                      sublabel: `${service.category} • ${service.duration} min`,
                    }))}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Data</Label>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <Input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="min-w-0"
                      />
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" size="icon" className="shrink-0" aria-label="Abrir calendário">
                            <Calendar className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <DatePickerCalendar
                            mode="single"
                            selected={editDate ? new Date(`${editDate}T12:00:00`) : undefined}
                            onSelect={(date) => date && setEditDate(format(date, 'yyyy-MM-dd'))}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Início</Label>
                    <Input
                      type="time"
                      value={editStartTime}
                      onChange={(e) => handleEditStartTimeChange(e.target.value)}
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

                {/* Propagate dates option for recurring/package appointments */}
                {(appointment.recurring_group_id || appointment.package_appointment) && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-info/10 border border-info/20">
                    <input
                      type="checkbox"
                      id="propagate-dates"
                      checked={propagateDates}
                      onChange={(e) => setPropagateDates(e.target.checked)}
                      className="rounded border-info"
                    />
                    <label htmlFor="propagate-dates" className="text-sm text-info cursor-pointer">
                      Ajustar datas dos próximos agendamentos automaticamente
                    </label>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleCancelEdit} className="flex-1">
                    <X className="h-4 w-4 mr-1" />
                    Cancelar
                  </Button>
                  <Button onClick={handleSaveEdit} className="flex-1" disabled={updateAppointment.isPending || propagateSeriesDates.isPending}>
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
                  <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
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
                  {/* Client credit balance - Use Credit Section */}
                  {availableClientCredit > 0 && (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-amber-500" />
                          <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                            Crédito disponível do cliente
                          </span>
                        </div>
                        <span className="text-lg font-bold text-amber-600">
                          R$ {availableClientCredit.toFixed(2)}
                        </span>
                      </div>
                      
                      {!useClientCredit ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full border-amber-500/50 text-amber-700 hover:bg-amber-500/10"
                          onClick={() => {
                            setUseClientCredit(true);
                            // Pre-fill with max usable amount (min of available credit and remaining)
                            setClientCreditUsedAmount(Math.min(availableClientCredit, remainingAmount).toFixed(2));
                          }}
                        >
                          <DollarSign className="h-4 w-4 mr-2" />
                          Usar Crédito no Pagamento
                        </Button>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-amber-700 dark:text-amber-400">
                              Valor do crédito a utilizar
                            </Label>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                setUseClientCredit(false);
                                setClientCreditUsedAmount('');
                              }}
                            >
                              <X className="h-3 w-3 mr-1" />
                              Cancelar
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max={Math.min(availableClientCredit, remainingAmount)}
                              placeholder="0,00"
                              value={clientCreditUsedAmount}
                              onChange={(e) => setClientCreditUsedAmount(e.target.value)}
                              className="border-amber-500/30 focus:border-amber-500"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="whitespace-nowrap border-amber-500/50"
                              onClick={() => setClientCreditUsedAmount(Math.min(availableClientCredit, remainingAmount).toFixed(2))}
                            >
                              Usar Tudo
                            </Button>
                          </div>
                          {clientCreditUsed > 0 && (
                            <div className="flex items-center gap-2 text-xs text-success bg-success/10 p-2 rounded">
                              <CheckCircle className="h-3 w-3" />
                              <span>R$ {clientCreditUsed.toFixed(2)} de crédito será descontado</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Discount Section */}
                  <div className="p-3 rounded-lg border border-orange-500/30 bg-orange-500/5">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-4 w-4 text-orange-500" />
                      <Label className="text-sm font-medium text-orange-700 dark:text-orange-400">
                        Desconto
                      </Label>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0,00"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(e.target.value)}
                    />
                    {discount > 0 && (
                      <p className="text-xs text-orange-600 mt-1">
                        Novo valor a pagar: R$ {remainingAfterDiscount.toFixed(2)}
                      </p>
                    )}
                  </div>

                  {/* Total to pay header */}
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <p className="text-sm text-muted-foreground">Valor a pagar</p>
                    <p className="text-xl font-bold text-primary">R$ {remainingAfterDiscount.toFixed(2)}</p>
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
                    const isClientCreditSelected = selectedMethod ? isClientCreditMethod(selectedMethod.name) : false;
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
                                const methodName = activePaymentMethods.find(m => m.id === value)?.name || value;
                                const newPayments = [...payments];
                                newPayments[index] = { 
                                  ...newPayments[index], 
                                  methodId: value, 
                                  method: methodName,
                                  cardBrandId: undefined,
                                  installments: 1,
                                  amount: isClientCreditMethod(methodName) ? Math.min(availableClientCredit, remainingAfterDiscount).toFixed(2) : newPayments[index].amount,
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
                              max={isClientCreditSelected ? Math.min(availableClientCredit, remainingAfterDiscount) : undefined}
                              onChange={(e) => updatePayment(index, 'amount', e.target.value)}
                            />
                            {isClientCreditSelected && (
                              <p className="mt-1 text-[10px] text-muted-foreground">Saldo disponível: R$ {availableClientCredit.toFixed(2)} • Máx. R$ {Math.min(availableClientCredit, remainingAfterDiscount).toFixed(2)}</p>
                            )}
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

                  {/* Courtesy Section REMOVED - no longer needed */}

                  {/* Payment summary */}
                  {(totalPaymentAmount > 0 || clientCreditUsed > 0) && (
                    <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                      {clientCreditUsed > 0 && (
                        <div className="flex justify-between text-sm text-amber-600">
                          <span>Saldo do cliente utilizado:</span>
                          <span className="font-semibold">- R$ {clientCreditUsed.toFixed(2)}</span>
                        </div>
                      )}
                      {totalPaymentAmount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span>Pagamento em formas:</span>
                          <span className="font-semibold">R$ {totalPaymentAmount.toFixed(2)}</span>
                        </div>
                      )}
                      {totalFeesToAddToClient > 0 && (
                        <div className="flex justify-between text-sm text-amber-600">
                          <span>Taxa de cartão:</span>
                          <span className="font-semibold">+ R$ {totalFeesToAddToClient.toFixed(2)}</span>
                        </div>
                      )}
                      <Separator className="my-1" />
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">Total a cobrar do cliente:</span>
                        <span className="font-bold text-primary">R$ {Math.max(0, totalWithFees - clientCreditUsed).toFixed(2)}</span>
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
                        <DollarSign className="h-4 w-4" />
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
                          <DollarSign className="h-4 w-4 mr-1" />
                          Saldo do Cliente
                        </Button>
                        <Button
                          variant={excessAction === 'change' ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1"
                          onClick={() => setExcessAction('change')}
                        >
                          <DollarSign className="h-4 w-4 mr-1" />
                          Devolver Troco
                        </Button>
                      </div>

                      {excessAction === 'credit' && (
                        <div className="text-xs text-success bg-success/10 p-2 rounded">
                          <strong>Saldo:</strong> R$ {excessPaymentAmount.toFixed(2)} será adicionado como saldo do cliente.
                          <br />
                          <span className="text-muted-foreground">
                            O valor será registrado no caixa e financeiro como recebimento.
                          </span>
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
                    <Button onClick={handleConfirmPayment} className="flex-1" disabled={(totalWithCredit <= 0 && !isCourtesyOnly) || isClientCreditInvalid}>
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

      {/* Client Profile Confirmation Dialog */}
      <AlertDialog open={showClientProfileDialog} onOpenChange={setShowClientProfileDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Ir para perfil do cliente?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deseja abrir o perfil de <strong>{appointment.client?.name}</strong>? Ao voltar, você retornará para a agenda com os detalhes deste agendamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleOpenClientProfile}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Abrir perfil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                    
                    {/* Recurring series options */}
                    {isRecurringSeries && (
                      <div className="space-y-3 p-3 rounded-lg bg-muted/30 border">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <History className="h-4 w-4 text-primary" />
                          <span>Este agendamento faz parte de uma série recorrente ({seriesIndex} de {seriesCount})</span>
                        </div>
                        <RadioGroup 
                          value={recurringDeleteType} 
                          onValueChange={(v) => setRecurringDeleteType(v as 'single' | 'following' | 'all')}
                        >
                          <div className="flex items-start space-x-3 p-2 rounded border hover:bg-muted/50 cursor-pointer">
                            <RadioGroupItem value="single" id="rec-single" className="mt-1" />
                            <div className="flex-1">
                              <Label htmlFor="rec-single" className="font-medium cursor-pointer text-sm">
                                Apenas este agendamento
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Os outros agendamentos da série serão mantidos
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-3 p-2 rounded border hover:bg-muted/50 cursor-pointer">
                            <RadioGroupItem value="following" id="rec-following" className="mt-1" />
                            <div className="flex-1">
                              <Label htmlFor="rec-following" className="font-medium cursor-pointer text-sm">
                                Este e todos os seguintes
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                {seriesCount - seriesIndex + 1} agendamento(s) serão excluídos
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-3 p-2 rounded border hover:bg-muted/50 cursor-pointer">
                            <RadioGroupItem value="all" id="rec-all" className="mt-1" />
                            <div className="flex-1">
                              <Label htmlFor="rec-all" className="font-medium cursor-pointer text-sm text-destructive">
                                Toda a série
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Todos os {seriesCount} agendamentos serão excluídos
                              </p>
                            </div>
                          </div>
                        </RadioGroup>
                      </div>
                    )}
                    
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
                          <Package className="h-4 w-4" />
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
