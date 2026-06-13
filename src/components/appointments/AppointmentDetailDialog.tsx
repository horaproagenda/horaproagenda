import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
import { DateInputWithCalendar } from '@/components/ui/date-input-with-calendar';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Calendar as DatePickerCalendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  ShoppingCart,
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
  Lock,
  FileDown,
  Send,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { Appointment, Professional, Room, AppointmentStatus } from '@/types';
import { cn, formatCurrency, normalizeBrazilianCurrency, parseBrazilianCurrency } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { formatDurationClock } from '@/lib/duration';
import { useAuth } from '@/contexts/AuthContext';
import { useAppointments } from '@/hooks/useAppointments';
import { useRecurringAppointments } from '@/hooks/useRecurringAppointments';
import { useRooms } from '@/hooks/useRooms';
import { useServices } from '@/hooks/useServices';
import { useProducts } from '@/hooks/useProducts';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useCardBrands } from '@/hooks/useCardBrands';
import { useCashRegisters } from '@/hooks/useCashRegisters';
import { useAppointmentLocks } from '@/hooks/useAppointmentLocks';
import { openWhatsappWithMessage } from '@/lib/whatsappLink';
import { usePackageAppointments } from '@/hooks/useServicePackages';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { appointmentStatusConfig } from '@/lib/appointmentStatus';
import { ClientBoletoStatus } from './ClientBoletoStatus';
import { getClientCreditPaymentLimit, isClientCreditPaymentMethod, showClientCreditValidationToast, validateClientCreditPayment } from '@/lib/clientCreditPayment';
import { createDateTimeInTimeZone, formatDateInTimeZone, formatTimeInTimeZone } from '@/lib/timezone';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import {
  buildChangeDescription,
  resolveAuthorName,
  UUID_RE,
} from '@/lib/appointmentHistoryFormat';

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
    usedClientCreditMethod?: string,
    additionalItems?: Array<{
      item_type: 'service' | 'product';
      service_id?: string | null;
      product_id?: string | null;
      quantity: number;
      unit_price: number;
      total_amount: number;
    }>
  ) => void;
}

type PaymentAdditionalItem = {
  item_type: 'service' | 'product';
  item_id: string;
  quantity: string;
  unit_price: string;
};

type AppointmentHistoryEvent = {
  id: string;
  created_at: string;
  title: string;
  description: string;
  amount?: number;
  kind: 'item' | 'change' | 'refund' | 'payment' | 'credit';
};

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
  const { updateAppointment, deleteAppointment, deletePackageAppointments, reversePayment } = useAppointments();
  const [confirmReverseOpen, setConfirmReverseOpen] = useState(false);
  const { activeLock, isLockedByOther, isAcquiring, acquireLock, releaseLock } = useAppointmentLocks(appointment?.id);
  const { deleteAppointmentSeries, getSeriesAppointments, propagateSeriesDates } = useRecurringAppointments();
  const { rooms } = useRooms();
  const { activeServices } = useServices();
  const { productsForSale } = useProducts();
  const { activePaymentMethods } = usePaymentMethods();
  const { activeCardBrands } = useCardBrands();
  const { currentOpenRegister } = useCashRegisters();
  const { settings } = useBusinessSettings();
  // Fetch real package_appointments to compute realized count for the refund flow
  const { appointments: pkgSessions } = usePackageAppointments(
    appointment?.package_appointment?.package?.id || appointment?.package_appointment?.package_id || null,
  );

  // Detect if this appointment's package was sold via boleto parcelado and still has open installments.
  // When true, we redirect the user to the client's boleto page instead of the inline payment flow.
  const packageIdForBoleto = appointment?.package_appointment?.package?.id || appointment?.package_appointment?.package_id || null;
  const { data: packageBoletoInfo } = useQuery({
    queryKey: ['appointment-package-boleto', packageIdForBoleto, appointment?.client_id],
    enabled: open && !!packageIdForBoleto && !!appointment?.client_id,
    queryFn: async () => {
      const { data: sales } = await supabase
        .from('single_sales')
        .select('id, payment_method:payment_methods(name)')
        .eq('package_id', packageIdForBoleto!)
        .eq('client_id', appointment!.client_id);
      const saleIds = (sales || []).map((s: any) => s.id);
      if (!saleIds.length) return { hasBoleto: false, hasOpen: false };
      const { data: insts } = await supabase
        .from('boleto_installments')
        .select('status')
        .in('sale_id', saleIds);
      const list = insts || [];
      if (!list.length) return { hasBoleto: false, hasOpen: false };
      const hasOpen = list.some((i: any) => i.status !== 'paid' && i.status !== 'cancelled');
      return { hasBoleto: true, hasOpen };
    },
    staleTime: 15_000,
  });
  const shouldRedirectToBoleto = !!packageBoletoInfo?.hasBoleto && !!packageBoletoInfo?.hasOpen;
  const { data: appointmentHistory = [] } = useQuery({
    queryKey: ['appointment-history', appointment?.id],
    enabled: open && !!appointment?.id,
    queryFn: async () => {
      if (!appointment?.id) return [] as AppointmentHistoryEvent[];

      const [auditResult, financialResult, cashResult, creditResult] = await Promise.all([
        supabase
          .from('audit_logs')
          .select('id, action, created_at, old_data, new_data, user_email')
          .eq('table_name', 'appointments')
          .eq('record_id', appointment.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('financial_entries')
          .select('id, created_at, type, description, amount, status, paid_date, notes')
          .eq('appointment_id', appointment.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('cash_transactions')
          .select('id, created_at, type, category, description, amount, payment_method, reference_type')
          .eq('reference_id', appointment.id)
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('client_credit_transactions')
          .select('id, created_at, transaction_type, amount, previous_balance, new_balance, description, professional_id, professional:professionals(id, name)')
          .eq('appointment_id', appointment.id)
          .order('created_at', { ascending: false }),
      ]);

      if (auditResult.error) throw auditResult.error;
      if (financialResult.error) throw financialResult.error;
      if (cashResult.error) throw cashResult.error;

      // Collect all UUIDs referenced in audit data, grouped by entity, to resolve to names
      const idBuckets: Record<'payment_methods' | 'professionals' | 'rooms' | 'services' | 'clients', Set<string>> = {
        payment_methods: new Set(),
        professionals: new Set(),
        rooms: new Set(),
        services: new Set(),
        clients: new Set(),
      };
      const collect = (bucket: keyof typeof idBuckets, value: unknown) => {
        if (!value) return;
        if (Array.isArray(value)) value.forEach(v => collect(bucket, v));
        else if (typeof value === 'string' && UUID_RE.test(value)) idBuckets[bucket].add(value);
      };
      for (const entry of auditResult.data || []) {
        for (const data of [entry.old_data, entry.new_data]) {
          const d = (data || {}) as Record<string, unknown>;
          collect('payment_methods', d.payment_methods);
          collect('professionals', d.professional_id);
          collect('rooms', d.room_id);
          collect('services', d.service_id);
          collect('clients', d.client_id);
        }
      }

      const fetchNames = async (table: string, ids: string[]): Promise<Map<string, string>> => {
        if (!ids.length) return new Map();
        const { data } = await supabase.from(table as any).select('id, name').in('id', ids);
        return new Map(((data as any[]) || []).map(row => [row.id, row.name]));
      };
      // Collect author emails to resolve to professional names
      const authorEmails = new Set<string>();
      for (const entry of auditResult.data || []) {
        if (entry.user_email) authorEmails.add(entry.user_email.toLowerCase());
      }
      const fetchProfessionalsByEmail = async (emails: string[]): Promise<Map<string, string>> => {
        if (!emails.length) return new Map();
        const { data } = await supabase
          .from('professionals')
          .select('email, name')
          .in('email', emails);
        return new Map(
          ((data as any[]) || [])
            .filter(row => row.email)
            .map(row => [String(row.email).toLowerCase(), row.name])
        );
      };

      const [pmMap, profMap, roomMap, svcMap, cliMap, profByEmailMap] = await Promise.all([
        fetchNames('payment_methods', [...idBuckets.payment_methods]),
        fetchNames('professionals', [...idBuckets.professionals]),
        fetchNames('rooms', [...idBuckets.rooms]),
        fetchNames('services', [...idBuckets.services]),
        fetchNames('clients', [...idBuckets.clients]),
        fetchProfessionalsByEmail([...authorEmails]),
      ]);
      const nameMaps = {
        payment_methods: pmMap,
        professional_id: profMap,
        room_id: roomMap,
        service_id: svcMap,
        client_id: cliMap,
      };

      const auditEvents = (auditResult.data || []).map((entry) => {
        const oldData = (entry.old_data || null) as Record<string, unknown> | null;
        const newData = (entry.new_data || null) as Record<string, unknown> | null;
        const { title, description, isPayment } = buildChangeDescription(entry.action, oldData, newData, nameMaps);
        const authorName = resolveAuthorName(entry.user_email, profByEmailMap);
        const author = authorName ? ` • por ${authorName}` : '';
        return {
          id: `audit-${entry.id}`,
          created_at: entry.created_at,
          title,
          description: `${description}${author}`,
          amount: Number((newData as any)?.amount_paid || 0) - Number((oldData as any)?.amount_paid || 0) || undefined,
          kind: isPayment ? 'payment' : 'change',
        } satisfies AppointmentHistoryEvent;
      });

      const financialEvents = (financialResult.data || []).map((entry) => {
        const isRefund = entry.type === 'payable' || entry.type === 'expense' || /devolu|estorno|desconto/i.test(entry.description || '');
        return {
          id: `financial-${entry.id}`,
          created_at: entry.created_at,
          title: isRefund ? 'Estorno/ajuste financeiro' : 'Registro financeiro',
          description: `${entry.description}${entry.status ? ` • ${entry.status}` : ''}`,
          amount: Number(entry.amount || 0),
          kind: isRefund ? 'refund' : 'payment',
        } satisfies AppointmentHistoryEvent;
      });

      const cashEvents = (cashResult.data || []).map((entry) => {
        const isRefund = entry.type === 'expense' || entry.category === 'refund';
        return {
          id: `cash-${entry.id}`,
          created_at: entry.created_at,
          title: isRefund ? 'Estorno no caixa' : 'Movimento de caixa',
          description: `${entry.description || 'Movimento vinculado ao agendamento'}${entry.payment_method ? ` • ${entry.payment_method}` : ''}`,
          amount: Number(entry.amount || 0),
          kind: isRefund ? 'refund' : 'payment',
        } satisfies AppointmentHistoryEvent;
      });

      const creditEvents = ((creditResult as any).data || []).map((entry: any) => {
        const profName = entry.professional?.name || null;
        const isUsed = entry.transaction_type === 'credit_used';
        return {
          id: `credit-${entry.id}`,
          created_at: entry.created_at,
          title: isUsed ? 'Crédito do cliente usado na baixa' : 'Movimento de crédito do cliente',
          description: `${entry.description || ''}${profName ? ` • Profissional: ${profName}` : ''} • Saldo: R$ ${Number(entry.previous_balance || 0).toFixed(2)} → R$ ${Number(entry.new_balance || 0).toFixed(2)}`,
          amount: Number(entry.amount || 0),
          kind: 'credit',
        } satisfies AppointmentHistoryEvent;
      });

      return [...auditEvents, ...financialEvents, ...cashEvents, ...creditEvents].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
  });
  
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
  // Refund flow when deleting the entire package
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundFeeType, setRefundFeeType] = useState<'percent' | 'fixed'>('percent');
  const [refundFeeValue, setRefundFeeValue] = useState<string>('0');
  const [refundMethodId, setRefundMethodId] = useState<string>('');
  const [refundDeductConsumed, setRefundDeductConsumed] = useState(true);
  const [refundNote, setRefundNote] = useState('');
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
  
  // Discount — pré-preencher com desconto configurado no agendamento
  const preconfiguredDiscount = Number((appointment as any)?.discount_amount || 0);
  const [discountAmount, setDiscountAmount] = useState(
    preconfiguredDiscount > 0 ? preconfiguredDiscount.toFixed(2).replace('.', ',') : ''
  );
  const [additionalItems, setAdditionalItems] = useState<PaymentAdditionalItem[]>([]);

  
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
  // Post-save confirmation when date/time of a package/recurring step changes
  const [pendingPropagation, setPendingPropagation] = useState<null | {
    new_start_time: Date;
    new_end_time: Date;
    type: 'package' | 'recurring';
    package_id?: string;
    recurring_group_id?: string;
  }>(null);

  // Confirmation when changing status to "missed" or "cancelled" on a package appointment:
  // user chooses whether to release the package session (make it available again)
  // or consume it (mark as done because the client missed/cancelled).
  const [pendingPackageOutcome, setPendingPackageOutcome] = useState<null | {
    newStatus: AppointmentStatus;
  }>(null);

  // Helper function to check if payment method is card
  const isMethodCard = (methodName: string) => {
    if (isClientCreditPaymentMethod(methodName)) return false;
    const lower = methodName.toLowerCase();
    return lower.includes('crédito') || lower.includes('débito') || lower.includes('cartão');
  };

  const isMethodCredit = (methodName: string) => {
    if (isClientCreditPaymentMethod(methodName)) return false;
    return methodName.toLowerCase().includes('crédito');
  };

  const isClientCreditMethod = (methodName: string) => {
    return isClientCreditPaymentMethod(methodName);
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
      setEditDate(formatDateInTimeZone(appointment.start_time, settings?.timezone));
      setEditStartTime(formatTimeInTimeZone(appointment.start_time, settings?.timezone));
      setEditEndTime(formatTimeInTimeZone(appointment.end_time, settings?.timezone));
      setEditServiceId(appointment.service_id || null);
      setEditProfessionalId(appointment.professional_id || null);
      setEditRoomId(appointment.room_id || null);
      setEditNotes(appointment.notes || '');
    }
  }, [appointment, isEditing, settings?.timezone]);

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
      const paymentAmount = parseBrazilianCurrency(payment.amount);
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

  // Get package session info — counts based on the package's package_appointments array
  // when available, falling back to the cached counter otherwise.
  const getPackageSessionInfo = () => {
    if (!appointment.package_appointment?.package) return null;
    const pkg: any = appointment.package_appointment.package;
    const totalSessions = pkg.total_sessions || 0;
    const sessions: any[] = Array.isArray(pkg.appointments) ? pkg.appointments : [];
    const scheduledSessions = sessions.length > 0
      ? sessions.filter((s) => !!s.appointment_id).length
      : (pkg.sessions_scheduled || 0);
    const realizedSessions = sessions.filter((s) => s.status === 'completed' || s.status === 'missed').length;
    const availableNow = Math.max(0, totalSessions - scheduledSessions);
    const availableAfterDelete = Math.max(0, Math.min(totalSessions, availableNow + 1));
    return {
      totalSessions,
      scheduledSessions,
      realizedSessions,
      availableNow,
      availableAfterDelete,
      packageName: pkg.name,
    };
  };

  const packageSessionInfo = getPackageSessionInfo();
  
  // Check if appointment is part of a recurring series
  const isRecurringSeries = appointment.recurring_group_id != null;

  // Compute amount paid at the package level (for the refund flow).
  const packageTotalPaid = appointment.package_appointment ? Number(appointment.amount_paid || 0) : 0;

  const handleDelete = async () => {
    // Handle package appointments (delete all from package)
    if (deleteMode === 'all' && appointment.package_appointment?.package_id) {
      // If the package has any payment registered, route through the refund flow
      if (packageTotalPaid > 0) {
        setShowDeleteDialog(false);
        setShowRefundDialog(true);
        return;
      }
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
    
    const newStartTime = createDateTimeInTimeZone(new Date(`${rescheduleDate}T12:00:00`), rescheduleTime, settings?.timezone);
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
      expectedVersion: appointment.version,
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
    if (isLockedByOther) {
      toast.warning(`Este agendamento está sendo editado por ${activeLock?.holder_name || activeLock?.user_email || 'outro usuário'}.`);
      return;
    }

    // For package appointments being marked as "faltou" or "cancelado",
    // ask whether to release the package session or consume it.
    if (
      !!appointment.package_appointment &&
      (newStatus === 'missed' || newStatus === 'cancelled')
    ) {
      setPendingPackageOutcome({ newStatus });
      return;
    }

    setSelectedStatus(newStatus);
    updateAppointment.mutate({
      id: appointment.id,
      updates: { status: newStatus },
      expectedVersion: appointment.version,
    });
  };

  const handleConfirmPackageOutcome = async (mode: 'release' | 'consume') => {
    if (!pendingPackageOutcome) return;
    const newStatus = pendingPackageOutcome.newStatus;
    try {
      const { error } = await (supabase as any).rpc('set_appointment_status_with_package_mode', {
        p_appointment_id: appointment.id,
        p_status: newStatus,
        p_mode: mode,
        p_expected_version: appointment.version,
      });
      if (error) throw error;
      setSelectedStatus(newStatus);
      toast.success(
        mode === 'release'
          ? 'Aplicação disponibilizada novamente no pacote.'
          : 'Aplicação baixada como feita.',
      );
      // Refresh dependent queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['appointments'] }),
        queryClient.invalidateQueries({ queryKey: ['service_packages'] }),
        queryClient.invalidateQueries({ queryKey: ['client_packages'] }),
        queryClient.invalidateQueries({ queryKey: ['package_appointments'] }),
      ]);
    } catch (err: any) {
      toast.error('Erro ao atualizar agendamento: ' + (err?.message || 'desconhecido'));
    } finally {
      setPendingPackageOutcome(null);
    }
  };

  const selectedEditService = activeServices.find((service) => service.id === editServiceId) || appointment.service;

  const recalculateEndTime = (startValue: string, serviceDuration = selectedEditService?.duration || 0) => {
    if (!editDate || !startValue || serviceDuration <= 0) return;

    const newStartTime = createDateTimeInTimeZone(new Date(`${editDate}T12:00:00`), startValue, settings?.timezone);
    const newEndTime = new Date(newStartTime.getTime() + serviceDuration * 60000);
    setEditEndTime(formatTimeInTimeZone(newEndTime, settings?.timezone));
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
    if (isLockedByOther) {
      toast.warning(`Este agendamento está sendo editado por ${activeLock?.holder_name || activeLock?.user_email || 'outro usuário'}.`);
      return;
    }

    const editBaseDate = new Date(`${editDate}T12:00:00`);
    const newStartTime = createDateTimeInTimeZone(editBaseDate, editStartTime, settings?.timezone);
    const newEndTime = createDateTimeInTimeZone(editBaseDate, editEndTime, settings?.timezone);
    
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
      expectedVersion: appointment.version,
    }, {
      onSuccess: () => {
        const isPackageApt = !!appointment.package_appointment;
        const isRecurringApt = !!appointment.recurring_group_id;
        const dateChanged =
          new Date(appointment.start_time).getTime() !== newStartTime.getTime() ||
          new Date(appointment.end_time).getTime() !== newEndTime.getTime();

        // If user pre-checked the inline option, propagate immediately
        if (propagateDates) {
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
        } else if (dateChanged && (isPackageApt || isRecurringApt)) {
          // Ask the user whether to also shift following steps
          setPendingPropagation({
            new_start_time: newStartTime,
            new_end_time: newEndTime,
            type: isRecurringApt ? 'recurring' : 'package',
            recurring_group_id: appointment.recurring_group_id || undefined,
            package_id: appointment.package_appointment?.package_id,
          });
        }

        setIsEditing(false);
        setPropagateDates(false);
        void releaseLock();
      },
    });
  };

  const handleConfirmPropagation = () => {
    if (!pendingPropagation) return;
    if (pendingPropagation.type === 'recurring' && pendingPropagation.recurring_group_id) {
      propagateSeriesDates.mutate({
        appointment_id: appointment.id,
        new_start_time: pendingPropagation.new_start_time,
        new_end_time: pendingPropagation.new_end_time,
        propagate_type: 'recurring',
        recurring_group_id: pendingPropagation.recurring_group_id,
      });
    } else if (pendingPropagation.type === 'package' && pendingPropagation.package_id) {
      propagateSeriesDates.mutate({
        appointment_id: appointment.id,
        new_start_time: pendingPropagation.new_start_time,
        new_end_time: pendingPropagation.new_end_time,
        propagate_type: 'package',
        package_id: pendingPropagation.package_id,
      });
    }
    setPendingPropagation(null);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    void releaseLock();
  };

  const handleStartEdit = async () => {
    const locked = await acquireLock();
    if (!locked) {
      toast.warning(`Este agendamento está sendo editado por ${activeLock?.holder_name || activeLock?.user_email || 'outro usuário'}.`);
      return;
    }
    setIsEditing(true);
  };

  const professionalId = appointment.professional_id || appointment.service?.professional_id;
  const professional = professionals.find(p => p.id === professionalId) || appointment.service?.professional;
  const status = statusConfig[appointment.status];
  
  // Check if this is a package appointment that's already paid
  const isPackageAppointment = !!appointment.package_appointment;
  const packageData = appointment.package_appointment?.package;
  
  // Package payment must reflect the synchronized amount on appointments, not only the existence of a payment method.
  
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
  const isPackagePaid = isPackageAppointment && packagePrice > 0 && Number(appointment.amount_paid || 0) >= packagePrice;
  
  // Desconto pré-configurado no agendamento: SEMPRE reduz o valor a pagar/total
  const grossServicePrice = isPackageAppointment ? packagePrice : servicePrice;
  const totalPrice = Math.max(0, grossServicePrice - (preconfiguredDiscount || 0));
  const persistedAdditionalItemsTotal = (appointment.additional_items || []).reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
  const paymentAdditionalItems = additionalItems
    .map((item) => {
      const quantity = Math.max(0, Number(item.quantity) || 0);
      const unitPrice = parseBrazilianCurrency(item.unit_price);
      return {
        ...item,
        quantity,
        unit_price_value: unitPrice,
        total_amount: quantity * unitPrice,
      };
    })
    .filter((item) => item.item_id && item.quantity > 0 && item.unit_price_value >= 0);
  const additionalItemsTotal = paymentAdditionalItems.reduce((sum, item) => sum + item.total_amount, 0);
  const finalAppointmentTotal = totalPrice + persistedAdditionalItemsTotal + additionalItemsTotal;
  
  // Calculate amount paid based on actual data
  // For packages: if paid, show full package price as paid. If not paid, show appointment's amount_paid
  // For regular services: show the actual amount_paid from the appointment
  const amountPaid = isPackageAppointment
    ? Math.min(packagePrice || Number(appointment.amount_paid || 0), Number(appointment.amount_paid || 0))
    : Number(appointment.amount_paid || 0);
  
  // Desconto persistido reduz o valor a receber (não gera saída no caixa/financeiro)
  const persistedDiscount = Number((appointment as any)?.discount_amount || 0);
  const remainingAmount = Math.max(0, (totalPrice + persistedAdditionalItemsTotal - persistedDiscount) - amountPaid);
  
  // Determine effective payment status based on actual amounts
  // This ensures consistency between displayed status and values
  const calculateEffectivePaymentStatus = () => {
    const requiredAfterDiscount = Math.max(0, totalPrice + persistedAdditionalItemsTotal - persistedDiscount);
    if (requiredAfterDiscount === 0) return 'paid';
    if (amountPaid >= requiredAfterDiscount) return 'paid';
    if (amountPaid > 0) return 'partial';
    return 'pending';
  };
  
  const effectivePaymentStatus = calculateEffectivePaymentStatus();
  const paymentStatus = paymentStatusConfig[effectivePaymentStatus];
  const PaymentIcon = paymentStatus.icon;

  const receiptRows = [
    {
      item: appointment.service?.name || appointment.package_appointment?.package?.name || 'Serviço',
      type: isPackageAppointment ? 'Pacote' : 'Serviço',
      quantity: 1,
      unitPrice: totalPrice,
      total: totalPrice,
    },
    ...(appointment.additional_items || []).map((item) => ({
      item: item.service?.name || item.product?.name || (item.item_type === 'service' ? 'Serviço adicional' : 'Produto adicional'),
      type: item.item_type === 'service' ? 'Serviço adicional' : 'Produto',
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unit_price || 0),
      total: Number(item.total_amount || 0),
    })),
  ];

  const normalizePdfText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const buildReceiptPdf = () => {
    const doc = new jsPDF();
    const clinicSettings = settings as (typeof settings & { clinic_name?: string; clinic_cnpj?: string; clinic_phone?: string; clinic_address?: string }) | null;
    const clinicName = clinicSettings?.clinic_name || 'Clínica de Estética';
    const receiptNumber = appointment.id.slice(0, 8).toUpperCase();
    const paymentMethods = (appointment.payment_methods || [])
      .map((method) => activePaymentMethods.find((item) => item.id === method)?.name || method)
      .join(', ') || 'Não informado';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(normalizePdfText('Recibo de Baixa'), 14, 18);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(normalizePdfText(`${clinicName} • Recibo ${receiptNumber}`), 14, 28);
    let infoY = 35;
    if (clinicSettings?.clinic_cnpj) {
      doc.text(normalizePdfText(`CNPJ: ${clinicSettings.clinic_cnpj}`), 14, infoY);
      infoY += 7;
    }
    if (clinicSettings?.clinic_phone) {
      doc.text(normalizePdfText(`Telefone: ${clinicSettings.clinic_phone}`), 14, infoY);
      infoY += 7;
    }
    if (clinicSettings?.clinic_address) {
      doc.text(normalizePdfText(`Endereço: ${clinicSettings.clinic_address}`), 14, infoY);
      infoY += 7;
    }
    doc.text(normalizePdfText(`Horário da clínica: ${settings?.opening_time || '08:00'} às ${settings?.closing_time || '20:00'}`), 14, infoY);
    infoY += 7;
    doc.text(normalizePdfText(`Emitido em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`), 14, infoY);

    let cursorY = infoY + 14;
    doc.setFont('helvetica', 'bold');
    doc.text(normalizePdfText('Cliente e agendamento'), 14, cursorY);
    cursorY += 8;
    doc.setFont('helvetica', 'normal');
    doc.text(normalizePdfText(`Cliente: ${appointment.client?.name || 'Não informado'}`), 14, cursorY); cursorY += 7;
    doc.text(normalizePdfText(`Telefone: ${appointment.client?.phone || 'Não informado'}`), 14, cursorY); cursorY += 7;
    doc.text(normalizePdfText(`Profissional: ${professional?.name || 'Não informado'}`), 14, cursorY); cursorY += 7;
    doc.text(normalizePdfText(`Data: ${format(new Date(`${formatDateInTimeZone(appointment.start_time, settings?.timezone)}T12:00:00`), 'dd/MM/yyyy')} • ${formatTimeInTimeZone(appointment.start_time, settings?.timezone)} às ${formatTimeInTimeZone(appointment.end_time, settings?.timezone)}`), 14, cursorY);

    autoTable(doc, {
      startY: cursorY + 8,
      head: [['Item', 'Tipo', 'Qtd.', 'Unitário', 'Total']],
      body: receiptRows.map((row) => [
        normalizePdfText(row.item),
        normalizePdfText(row.type),
        String(row.quantity),
        formatCurrency(row.unitPrice),
        formatCurrency(row.total),
      ]),
      styles: { font: 'helvetica', fontSize: 9 },
      headStyles: { fillColor: [44, 62, 80] },
    });

    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 120;
    doc.setFont('helvetica', 'normal');
    doc.text(normalizePdfText(`Valor original: ${formatCurrency(totalPrice)}`), 14, finalY + 12);
    doc.text(normalizePdfText(`Serviços/produtos adicionados: ${formatCurrency(persistedAdditionalItemsTotal)}`), 14, finalY + 20);
    doc.text(normalizePdfText(`Forma(s) de pagamento: ${paymentMethods}`), 14, finalY + 28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(normalizePdfText(`Total final: ${formatCurrency(totalPrice + persistedAdditionalItemsTotal)}`), 14, finalY + 40);
    doc.setFontSize(11);
    doc.text(normalizePdfText(`Valor pago: ${formatCurrency(amountPaid)}`), 14, finalY + 49);
    return doc;
  };

  const handleDownloadReceipt = () => {
    buildReceiptPdf().save(`recibo_${safeClient.name.replace(/\s+/g, '_')}_${appointment.id.slice(0, 8)}.pdf`);
    toast.success('Recibo gerado para download.');
  };

  const handleSendReceipt = async () => {
    const phone = appointment.client?.phone?.replace(/\D/g, '');
    if (!phone) {
      toast.error('Cliente sem telefone cadastrado.');
      return;
    }
    const pdfBlob = buildReceiptPdf().output('blob');
    const file = new File([pdfBlob], `recibo_${appointment.id.slice(0, 8)}.pdf`, { type: 'application/pdf' });
    const shareData = { files: [file], title: 'Recibo de pagamento', text: `Recibo da baixa de ${safeClient.name}` };
    if (navigator.canShare?.(shareData)) {
      await navigator.share(shareData);
      return;
    }
    const message = `Olá ${safeClient.name}, segue o recibo da baixa do seu agendamento. Total: ${formatCurrency(totalPrice + persistedAdditionalItemsTotal)}.`;
    openWhatsappWithMessage(phone, message);
    toast.info('WhatsApp aberto. Baixe o PDF e anexe na conversa.');
  };

  const addPaymentMethod = () => {
    setPayments([...payments, { method: '', amount: '' }]);
  };

  const addAdditionalItem = (item_type: 'service' | 'product') => {
    setAdditionalItems([...additionalItems, { item_type, item_id: '', quantity: '1', unit_price: '' }]);
  };

  const removeAdditionalItem = (index: number) => {
    setAdditionalItems(additionalItems.filter((_, i) => i !== index));
  };

  const updateAdditionalItem = (index: number, updates: Partial<PaymentAdditionalItem>) => {
    const newItems = [...additionalItems];
    const nextItem = { ...newItems[index], ...updates };
    if (updates.item_id) {
      if (nextItem.item_type === 'service') {
        const service = activeServices.find((s) => s.id === updates.item_id);
        nextItem.unit_price = service ? String(service.price || 0) : nextItem.unit_price;
      } else {
        const product = productsForSale.find((p) => p.id === updates.item_id);
        nextItem.unit_price = product ? String(product.sale_price || product.unit_price || 0) : nextItem.unit_price;
      }
    }
    newItems[index] = nextItem;
    setAdditionalItems(newItems);
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
    return isClientCreditMethod(methodName) ? sum + parseBrazilianCurrency(p.amount) : sum;
  }, 0);
  const moneyPaymentAmount = payments.reduce((sum, p) => {
    const methodName = activePaymentMethods.find(m => m.id === p.methodId)?.name || p.method;
    return isClientCreditMethod(methodName) ? sum : sum + parseBrazilianCurrency(p.amount);
  }, 0);
  const totalPaymentAmount = moneyPaymentAmount;
  const courtesyCredit = 0; // Cortesia removed
  const discount = parseBrazilianCurrency(discountAmount); // Desconto aplicado
  
  // Calculate credit to be used from client's available balance
  const availableClientCredit = appointment.client?.credit_balance || 0;
  
  // Remaining amount after discount
  const remainingAfterDiscount = Math.max(0, (finalAppointmentTotal - amountPaid) - discount);
  const creditLimitForPayment = getClientCreditPaymentLimit(availableClientCredit, remainingAfterDiscount);
  const clientCreditValidationMessage = validateClientCreditPayment(paymentMethodCreditUsed, availableClientCredit, remainingAfterDiscount);
  const isClientCreditInvalid = paymentMethodCreditUsed > 0 && !!clientCreditValidationMessage;
  
  const clientCreditUsed = Math.min(
    (useClientCredit ? parseBrazilianCurrency(clientCreditUsedAmount) : 0) + paymentMethodCreditUsed,
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
    if (showClientCreditValidationToast(isClientCreditInvalid ? clientCreditValidationMessage : null)) {
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
      return isClientCreditMethod(methodName) && parseBrazilianCurrency(p.amount) > 0;
    });
    const validPayments = payments
      .filter(p => p.amount && parseBrazilianCurrency(p.amount) > 0 && !isClientCreditMethod(activePaymentMethods.find(m => m.id === p.methodId)?.name || p.method))
      .map(p => ({ 
        method: p.methodId || p.method, 
        amount: normalizeBrazilianCurrency(p.amount),
        cardBrandId: p.cardBrandId,
        installments: p.installments
      }));
    const validAdditionalItems = paymentAdditionalItems.map((item) => ({
      item_type: item.item_type,
      service_id: item.item_type === 'service' ? item.item_id : null,
      product_id: item.item_type === 'product' ? item.item_id : null,
      quantity: item.quantity,
      unit_price: item.unit_price_value,
      total_amount: item.total_amount,
    }));

    // If excess payment should become client SALDO (credit with financial registration)
    // excessAction === 'credit' means the excess becomes saldo (real money stored as credit)
    const finalClientCredit = excessAction === 'credit' ? excessPaymentAmount : undefined;
    
    // Courtesy removed - no longer send courtesyCredit
    const finalCourtesyCredit = undefined;

    if (validPayments.length > 0 || validAdditionalItems.length > 0 || finalClientCredit || finalCourtesyCredit || clientCreditUsed > 0 || discount > 0) {
      onPayment(
        appointment.id, 
        validPayments, 
        finalClientCredit, // Saldo: troco real registrado no caixa/financeiro
        finalCourtesyCredit, // Cortesia: brinde sem entrada financeira
        currentOpenRegister?.id,
        clientCreditUsed > 0 ? clientCreditUsed : undefined,
        discount > 0 ? discount : undefined, // Desconto aplicado
        clientCreditPaymentMethod?.methodId || clientCreditPaymentMethod?.method,
        validAdditionalItems
      );
      setShowPaymentForm(false);
      setPayments([{ method: '', amount: '' }]);
      // courtesyCreditAmount removed
      setClientCreditUsedAmount('');
      setDiscountAmount('');
      setAdditionalItems([]);
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

  // Resolve professional color for visual identity in the dialog
  const dialogProfessionalId = appointment.professional_id || appointment.service?.professional_id;
  const dialogProfessional = professionals.find(p => p.id === dialogProfessionalId);
  const dialogProfColor = dialogProfessional?.agenda_color || 'hsl(var(--primary))';

  // Compute responsive font-size for the client name so the status badge always fits.
  // Long names shrink down to a minimum; short names keep the larger size.
  const clientNameLength = (appointment.client?.name || '').length;
  const clientNameSizeClass =
    clientNameLength > 32 ? 'text-sm' :
    clientNameLength > 24 ? 'text-base' :
    clientNameLength > 18 ? 'text-lg' : 'text-xl';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden"
          style={{ borderLeft: `4px solid ${dialogProfColor}` }}
        >
          <DialogHeader
            className="px-6 pt-6 pb-2 flex-shrink-0 border-b"
            style={{ borderBottomColor: `${dialogProfColor}40` }}
          >
            <DialogTitle className="flex items-center gap-2">
              {isPackageAppointment ? (
                <Package className="h-5 w-5" style={{ color: dialogProfColor }} />
              ) : (
                <Sparkles className="h-5 w-5" style={{ color: dialogProfColor }} />
              )}
              {isPackageAppointment 
                ? packageData?.name || 'Sessão de Pacote'
                : appointment.service?.name || 'Serviço'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
            {/* Client Info */}
            <div
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
              style={{ borderLeft: `3px solid ${dialogProfColor}` }}
            >
              <User className="h-5 w-5 mt-0.5" style={{ color: dialogProfColor }} />
              <div className="flex-1 min-w-0 space-y-1.5">
                <Button
                  type="button"
                  variant="link"
                  className={cn(
                    'h-auto p-0 font-semibold text-foreground text-left max-w-full whitespace-normal break-words leading-tight',
                    clientNameSizeClass
                  )}
                  onClick={() => setShowClientProfileDialog(true)}
                >
                  {appointment.client?.name}
                </Button>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{appointment.client?.phone}</span>
                </div>
                {dialogProfessional && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: dialogProfColor }}
                    />
                    <span className="truncate">{dialogProfessional.name}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                {isLockedByOther && (
                  <Badge variant="outline" className="h-6 gap-1 text-[10px]">
                    <Lock className="h-3 w-3" />
                    {activeLock?.holder_name || activeLock?.user_email || 'Em edição'}
                  </Badge>
                )}
                <div className="flex items-center gap-1.5">
                  {canEdit && !isEditing && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleStartEdit} disabled={isLockedByOther || isAcquiring}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Select value={appointment.status} onValueChange={(v) => handleStatusChange(v as AppointmentStatus)} disabled={isLockedByOther}>
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
                    options={(() => {
                      const list = activeServices.map((service) => ({
                        value: service.id,
                        label: service.name,
                        sublabel: `${service.category} • ${formatDurationClock(service.duration)}`,
                      }));
                      const currentId = appointment.service_id;
                      if (currentId && !list.some((o) => o.value === currentId)) {
                        list.unshift({
                          value: currentId,
                          label: appointment.service?.name || 'Serviço atual',
                          sublabel: appointment.service?.duration ? formatDurationClock(appointment.service.duration) : '',
                        });
                      }
                      return list;
                    })()}
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
                  <span>{format(new Date(`${formatDateInTimeZone(appointment.start_time, settings?.timezone)}T12:00:00`), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
                </div>

                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {formatTimeInTimeZone(appointment.start_time, settings?.timezone)} - {formatTimeInTimeZone(appointment.end_time, settings?.timezone)}
                    <span className="text-muted-foreground ml-1">({formatDurationClock(appointment.service?.duration || 0)})</span>
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
                  <p className="font-semibold">R$ {(totalPrice + persistedAdditionalItemsTotal).toFixed(2)}</p>
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

              {/* Desfazer baixa — zera amount_paid, remove cash/financial entries e devolve crédito do cliente */}
              {amountPaid > 0 && (
                <div className="col-span-3 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmReverseOpen(true)}
                    disabled={reversePayment.isPending}
                    className="h-7 px-2 text-[11px] font-medium text-warning border-warning/40 hover:bg-warning/10 hover:text-warning"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {reversePayment.isPending ? 'Desfazendo…' : 'Desfazer baixa'}
                  </Button>
                </div>
              )}

              </div>

              {/* Package payment indicator - packages must be paid in full */}
              {isPackageAppointment && !isPackagePaid && remainingAmount > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <Package className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-primary">Pagamento de Pacote</p>
                    <p className="text-xs text-muted-foreground">
                      O valor total do pacote é <strong>R$ {(packageData?.total_price || 0).toFixed(2)}</strong>; pagamentos parciais são sincronizados em todas as aplicações.
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

              {/* Boleto status alert — only when this appointment's service/package was sold via boleto */}
              <ClientBoletoStatus
                clientId={appointment.client_id}
                serviceId={appointment.service_id}
                packageId={packageIdForBoleto}
              />

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

              {(appointment.additional_items?.length || 0) > 0 && (
                <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
                  <p className="text-sm font-medium">Serviços/produtos adicionados</p>
                  {appointment.additional_items?.map((item) => (
                    <div key={item.id || `${item.item_type}-${item.service_id}-${item.product_id}`} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">
                        {item.item_type === 'service' ? <Sparkles className="h-3 w-3 inline mr-1" /> : <ShoppingCart className="h-3 w-3 inline mr-1" />}
                        {item.service?.name || item.product?.name || 'Item adicional'} × {Number(item.quantity || 0)}
                      </span>
                      <span className="font-medium">{formatCurrency(Number(item.total_amount || 0))}</span>
                    </div>
                  ))}
                </div>
              )}

              {(amountPaid > 0 || persistedAdditionalItemsTotal > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={handleDownloadReceipt}>
                    <FileDown className="h-4 w-4 mr-2" />
                    Baixar recibo PDF
                  </Button>
                  <Button type="button" variant="outline" onClick={handleSendReceipt}>
                    <Send className="h-4 w-4 mr-2" />
                    Enviar ao cliente
                  </Button>
                </div>
              )}

              {/* Payment Form */}
              {showPaymentForm ? (
                <div className="space-y-3 p-3 rounded-lg border border-border">
                  {/* Client credit is available as a payment method below in the payment selector */}

                  {/* Discount Section */}
                  <div className="p-3 rounded-lg border border-orange-500/30 bg-orange-500/5">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-4 w-4 text-orange-500" />
                      <Label className="text-sm font-medium text-orange-700 dark:text-orange-400">
                        Desconto
                      </Label>
                    </div>
                    <CurrencyInput value={discountAmount} onValueChange={(value) => setDiscountAmount(String(value))} />
                    {discount > 0 && (
                      <p className="text-xs text-orange-600 mt-1">
                        Novo valor a pagar: {formatCurrency(remainingAfterDiscount)}
                      </p>
                    )}
                  </div>

                  {/* Total to pay header */}
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <p className="text-sm text-muted-foreground">Resumo financeiro do agendamento</p>
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex justify-between"><span>Valor original</span><span className="font-medium">{formatCurrency(totalPrice)}</span></div>
                      {persistedAdditionalItemsTotal > 0 && <div className="flex justify-between"><span>Adicionais já lançados</span><span className="font-medium">{formatCurrency(persistedAdditionalItemsTotal)}</span></div>}
                      <div className="flex justify-between"><span>Itens adicionados nesta baixa</span><span className="font-medium">{formatCurrency(additionalItemsTotal)}</span></div>
                      <Separator className="my-1" />
                      <div className="flex justify-between text-base"><span className="font-semibold">Total final</span><span className="font-bold text-primary">{formatCurrency(finalAppointmentTotal)}</span></div>
                      <div className="flex justify-between text-muted-foreground"><span>Já pago</span><span>{formatCurrency(amountPaid)}</span></div>
                    </div>
                    <p className="mt-2 text-xl font-bold text-primary">{formatCurrency(remainingAfterDiscount)}</p>
                    {isPackageAppointment && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Valor total do pacote (pagamento integral obrigatório)
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Adicionar na baixa</p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => addAdditionalItem('service')}>
                          <Plus className="h-4 w-4 mr-1" /> Serviço
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => addAdditionalItem('product')}>
                          <ShoppingCart className="h-4 w-4 mr-1" /> Produto
                        </Button>
                      </div>
                    </div>
                    {additionalItems.map((item, index) => {
                      const options = item.item_type === 'service'
                        ? activeServices.map((service) => ({ value: service.id, label: service.name, sublabel: formatCurrency(service.price || 0) }))
                        : productsForSale.map((product) => ({ value: product.id, label: product.name, sublabel: formatCurrency(product.sale_price || product.unit_price || 0) }));
                      const lineTotal = (Number(item.quantity) || 0) * parseBrazilianCurrency(item.unit_price);
                      return (
                        <div key={`${item.item_type}-${index}`} className="space-y-2 p-3 rounded-lg border bg-muted/30">
                          <div className="flex items-end gap-2">
                            <div className="flex-1">
                              <Label className="text-xs">{item.item_type === 'service' ? 'Serviço' : 'Produto'}</Label>
                              <SearchableSelect options={options} value={item.item_id} onChange={(value) => updateAdditionalItem(index, { item_id: value })} placeholder="Selecione..." searchPlaceholder="Buscar..." />
                            </div>
                            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeAdditionalItem(index)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div><Label className="text-xs">Qtd.</Label><Input value={item.quantity} onChange={(e) => updateAdditionalItem(index, { quantity: e.target.value })} /></div>
                            <div><Label className="text-xs">Valor</Label><CurrencyInput value={item.unit_price} onValueChange={(value) => updateAdditionalItem(index, { unit_price: String(value) })} /></div>
                            <div><Label className="text-xs">Total</Label><div className="h-10 flex items-center font-semibold">{formatCurrency(lineTotal)}</div></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <p className="text-sm font-medium">Registrar Pagamento</p>
                  
      {payments.map((payment, index) => {
                    const selectedMethod = activePaymentMethods.find(m => m.id === payment.methodId);
                    const isCard = selectedMethod ? isMethodCard(selectedMethod.name) : false;
                    const isCredit = selectedMethod ? isMethodCredit(selectedMethod.name) : false;
                    const isClientCreditSelected = selectedMethod ? isClientCreditMethod(selectedMethod.name) : false;
                    const applicableBrands = payment.methodId ? getApplicableCardBrands(payment.methodId) : [];
                    const maxInstallments = payment.methodId ? getMaxInstallments(payment.methodId) : 1;
                    const paymentAmount = parseBrazilianCurrency(payment.amount);
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
                                {activePaymentMethods
                                  .filter(m => !m.name.toLowerCase().includes('boleto'))
                                  .map(m => (
                                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex-1">
                            <Label className="text-xs">Valor (R$)</Label>
                            <CurrencyInput
                              value={payment.amount}
                              onValueChange={(value) => updatePayment(index, 'amount', String(value))}
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
                shouldRedirectToBoleto ? (
                  <Button
                    onClick={() => {
                      try {
                        sessionStorage.setItem('openBoletoClientId', appointment.client_id || '');
                      } catch {}
                      onOpenChange(false);
                      navigate('/financeiro?tab=formas');
                    }}
                    className="w-full"
                    variant="default"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Dar baixa no boleto bancário
                  </Button>
                ) : (
                  <Button onClick={() => setShowPaymentForm(true)} className="w-full">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Dar Baixa no Pagamento
                  </Button>
                )
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

            <Separator />
            <Tabs defaultValue="items" className="space-y-3">
              <TabsList className="grid w-full grid-cols-4 h-9">
                <TabsTrigger value="items" className="text-xs">Itens</TabsTrigger>
                <TabsTrigger value="changes" className="text-xs">Mudanças</TabsTrigger>
                <TabsTrigger value="credit" className="text-xs">Crédito</TabsTrigger>
                <TabsTrigger value="refunds" className="text-xs">Estornos</TabsTrigger>
              </TabsList>
              <TabsContent value="items" className="space-y-2 mt-0">
                {receiptRows.map((row, index) => (
                  <div key={`${row.type}-${index}`} className="flex items-center justify-between gap-3 p-2 rounded-md bg-muted/30 text-sm">
                    <div>
                      <p className="font-medium">{row.item}</p>
                      <p className="text-xs text-muted-foreground">{row.type} • qtd. {row.quantity}</p>
                    </div>
                    <span className="font-semibold">{formatCurrency(row.total)}</span>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="changes" className="space-y-2 mt-0">
                {appointmentHistory.filter((event) => event.kind === 'change' || event.kind === 'payment' || event.kind === 'credit').length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma mudança registrada.</p>
                ) : appointmentHistory.filter((event) => event.kind === 'change' || event.kind === 'payment' || event.kind === 'credit').map((event) => (
                  <div key={event.id} className={`p-2 rounded-md border text-sm ${event.kind === 'credit' ? 'border-primary/30 bg-primary/5' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{event.title}</p>
                      <span className="text-xs text-muted-foreground">{format(new Date(event.created_at), 'dd/MM HH:mm')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{event.description}</p>
                    {event.kind === 'credit' && event.amount ? (
                      <p className="text-xs font-semibold text-primary mt-1">Valor usado: {formatCurrency(event.amount)}</p>
                    ) : null}
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="credit" className="space-y-2 mt-0">
                {appointmentHistory.filter((event) => event.kind === 'credit').length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum movimento de crédito do cliente neste agendamento.</p>
                ) : appointmentHistory.filter((event) => event.kind === 'credit').map((event) => (
                  <div key={event.id} className="p-2 rounded-md border border-primary/30 bg-primary/5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-primary">{event.title}</p>
                      <span className="font-semibold">{formatCurrency(event.amount || 0)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(event.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    <p className="text-xs text-muted-foreground">{event.description}</p>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="refunds" className="space-y-2 mt-0">
                {appointmentHistory.filter((event) => event.kind === 'refund').length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum estorno registrado.</p>
                ) : appointmentHistory.filter((event) => event.kind === 'refund').map((event) => (
                  <div key={event.id} className="p-2 rounded-md border border-destructive/20 bg-destructive/5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-destructive">{event.title}</p>
                      <span className="font-semibold">{formatCurrency(event.amount || 0)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{format(new Date(event.created_at), 'dd/MM/yyyy HH:mm')} • {event.description}</p>
                  </div>
                ))}
              </TabsContent>
            </Tabs>

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

      {/* Propagate dates confirmation (package / recurring step rescheduled) */}
      <AlertDialog open={!!pendingPropagation} onOpenChange={(o) => { if (!o) setPendingPropagation(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ajustar próximas etapas?</AlertDialogTitle>
            <AlertDialogDescription>
              Você alterou a data desta etapa do {pendingPropagation?.type === 'package' ? 'kit/pacote' : 'recorrente'}.
              Deseja reagendar automaticamente as etapas seguintes mantendo o mesmo intervalo entre elas,
              respeitando os dias e horários de funcionamento?
              <br /><br />
              <strong>Sim</strong>: as próximas datas serão recalculadas.<br />
              <strong>Não</strong>: as próximas datas permanecem como estão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingPropagation(null)}>Não alterar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPropagation}>Sim, ajustar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reverse Payment Confirmation Dialog */}

      <AlertDialog open={confirmReverseOpen} onOpenChange={setConfirmReverseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-warning" />
              Desfazer baixa do pagamento?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação vai zerar o valor pago, remover as entradas correspondentes do caixa e do financeiro
              {Number((appointment as any).used_client_credit || 0) > 0 && ' e devolver o crédito ao cliente'}
              . O agendamento voltará a ficar como <strong>pendente</strong> e você poderá dar baixa novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                reversePayment.mutate(appointment.id);
                setConfirmReverseOpen(false);
              }}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Sim, desfazer baixa
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
                    
                    {/* Payment warning — only when NOT a package appointment.
                        For packages, the payment is at the package level and remains
                        valid for the remaining sessions; deleting one session does
                        NOT remove any payment from caixa or financeiro. */}
                    {amountPaid > 0 && !isPackageAppointment && (
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

                    {amountPaid > 0 && isPackageAppointment && (
                      <div className="p-3 rounded-lg bg-info/10 border border-info/20">
                        <div className="flex items-center gap-2 text-info font-medium mb-2">
                          <DollarSign className="h-4 w-4" />
                          <span>Pagamento do pacote será preservado</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          O valor pago de <strong>R$ {amountPaid.toFixed(2)}</strong> permanece registrado no caixa e no financeiro,
                          vinculado ao pacote, e continua valendo para as demais aplicações.
                          Para devolver o dinheiro ao cliente, exclua o pacote inteiro.
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
                          Apenas <strong>1 aplicação</strong> será liberada para reagendamento.
                        </p>
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Disponíveis agora:</span>
                          <span className="font-medium text-foreground">{packageSessionInfo.availableNow}</span>
                          <span>→ após excluir:</span>
                          <span className="font-medium text-foreground">{packageSessionInfo.availableAfterDelete}</span>
                          <span>(de {packageSessionInfo.totalSessions} total)</span>
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
                            <DateInputWithCalendar
                              value={rescheduleDate}
                              onChange={setRescheduleDate}
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

      {/* Refund Dialog — only shown when deleting an entire paid package */}
      {(() => {
        if (!showRefundDialog || !packageData) return null;
        const totalSessions = packageSessionInfo?.totalSessions || packageData?.total_sessions || 0;
        const realized = (pkgSessions || []).filter((s: any) => s.status === 'completed' || s.status === 'missed').length
          || packageSessionInfo?.realizedSessions
          || 0;
        const perSession = totalSessions > 0 ? packageTotalPaid / totalSessions : 0;
        const consumedValue = refundDeductConsumed ? perSession * realized : 0;
        const baseRefundable = Math.max(0, packageTotalPaid - consumedValue);
        const feeNum = parseFloat((refundFeeValue || '0').replace(',', '.')) || 0;
        const feeAmount = refundFeeType === 'percent'
          ? Math.max(0, (baseRefundable * feeNum) / 100)
          : Math.max(0, Math.min(feeNum, baseRefundable));
        const refundAmount = Math.max(0, baseRefundable - feeAmount);

        return (
          <AlertDialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
            <AlertDialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
              <AlertDialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
                <AlertDialogTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-warning" />
                  Excluir pacote e devolver dinheiro
                </AlertDialogTitle>
              </AlertDialogHeader>
              <div className="overflow-y-auto px-6 py-4 flex-1 min-h-0">
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-sm">
                    <p>
                      Pacote <strong>{packageData?.name}</strong> de <strong>{appointment.client?.name}</strong>.
                      Configure a devolução abaixo. Os agendamentos do pacote serão excluídos
                      e os pagamentos originais removidos do caixa/financeiro.
                    </p>

                    <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                      <div className="flex justify-between"><span>Valor pago no pacote</span><span className="font-medium">R$ {packageTotalPaid.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Aplicações realizadas</span><span className="font-medium">{realized} de {totalSessions}</span></div>
                      <div className="flex justify-between"><span>Valor por aplicação</span><span className="font-medium">R$ {perSession.toFixed(2)}</span></div>
                    </div>

                    <div className="flex items-start gap-2 p-2 rounded border">
                      <input
                        id="refund-deduct"
                        type="checkbox"
                        className="mt-1"
                        checked={refundDeductConsumed}
                        onChange={(e) => setRefundDeductConsumed(e.target.checked)}
                      />
                      <Label htmlFor="refund-deduct" className="text-xs leading-snug">
                        Descontar aplicações já realizadas
                        ({realized} × R$ {perSession.toFixed(2)} = <strong>R$ {(perSession * realized).toFixed(2)}</strong>)
                      </Label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Tipo de multa</Label>
                        <Select value={refundFeeType} onValueChange={(v) => setRefundFeeType(v as 'percent' | 'fixed')}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">Percentual (%)</SelectItem>
                            <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Valor da multa</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={refundFeeValue}
                          onChange={(e) => setRefundFeeValue(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">Forma de devolução</Label>
                      <Select value={refundMethodId} onValueChange={setRefundMethodId}>
                        <SelectTrigger><SelectValue placeholder="Selecione a forma de pagamento" /></SelectTrigger>
                        <SelectContent>
                          {(activePaymentMethods || [])
                            .filter((pm: any) => !pm.name.toLowerCase().includes('boleto'))
                            .map((pm: any) => (
                            <SelectItem key={pm.id} value={pm.name}>{pm.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">Observação (opcional)</Label>
                      <Input
                        value={refundNote}
                        onChange={(e) => setRefundNote(e.target.value)}
                        placeholder="Motivo da devolução"
                      />
                    </div>

                    <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 space-y-1">
                      <div className="flex justify-between"><span>Base devolvível</span><span className="font-medium">R$ {baseRefundable.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Multa</span><span className="font-medium">- R$ {feeAmount.toFixed(2)}</span></div>
                      <div className="flex justify-between text-base pt-1 border-t border-warning/30">
                        <span className="font-semibold">Total a devolver</span>
                        <span className="font-bold text-warning">R$ {refundAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </AlertDialogDescription>
              </div>

              <AlertDialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
                <AlertDialogCancel onClick={() => setShowRefundDialog(false)}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={!refundMethodId || deletePackageAppointments.isPending}
                  onClick={() => {
                    if (!appointment.package_appointment?.package_id) return;
                    deletePackageAppointments.mutate(
                      {
                        packageId: appointment.package_appointment.package_id,
                        refund: {
                          amountPaid: packageTotalPaid,
                          consumedValue,
                          feeAmount,
                          refundAmount,
                          refundMethod: refundMethodId,
                          note: refundNote,
                        },
                      },
                      {
                        onSuccess: () => {
                          setShowRefundDialog(false);
                          onOpenChange(false);
                        },
                      },
                    );
                  }}
                >
                  Excluir pacote e devolver R$ {refundAmount.toFixed(2)}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}


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
