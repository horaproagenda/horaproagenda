import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
  Scissors,
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

interface AppointmentDetailDialogProps {
  appointment: Appointment | null;
  professionals: Professional[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPayment: (appointmentId: string, paymentMethods: { method: string; amount: number }[], clientCredit?: number) => void;
}

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'debit_card', label: 'Cartão de Débito' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'bank_transfer', label: 'Transferência' },
];

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
  const canAddClientCredit = hasRole('admin');
  const canDelete = hasRole('admin');
  const canEdit = hasRole('admin') || hasRole('receptionist');
  
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payments, setPayments] = useState<{ method: string; amount: string }[]>([
    { method: 'pix', amount: '' },
  ]);
  const [clientCreditAmount, setClientCreditAmount] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'single' | 'all'>('single');
  const [selectedStatus, setSelectedStatus] = useState<AppointmentStatus | ''>('');
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editProfessionalId, setEditProfessionalId] = useState<string | null>(null);
  const [editRoomId, setEditRoomId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');

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

  if (!appointment) return null;
  
  const handleDelete = () => {
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
          onOpenChange(false);
        },
      });
    }
  };

  const handleOpenDeleteDialog = (mode: 'single' | 'all') => {
    setDeleteMode(mode);
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
  
  // For package appointments, consider them as "paid" since the package was already purchased
  const effectivePaymentStatus = isPackageAppointment ? 'paid' : (appointment.payment_status || 'pending');
  const paymentStatus = paymentStatusConfig[effectivePaymentStatus];
  const PaymentIcon = paymentStatus.icon;
  
  // For package appointments, the price is from the package, not the service
  const totalPrice = isPackageAppointment ? 0 : (appointment.service?.price || 0);
  const amountPaid = isPackageAppointment ? 0 : (appointment.amount_paid || 0);
  const remainingAmount = totalPrice - amountPaid;

  const addPaymentMethod = () => {
    setPayments([...payments, { method: 'pix', amount: '' }]);
  };

  const removePaymentMethod = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  const updatePayment = (index: number, field: 'method' | 'amount', value: string) => {
    const newPayments = [...payments];
    newPayments[index][field] = value;
    setPayments(newPayments);
  };

  const totalPaymentAmount = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const clientCredit = parseFloat(clientCreditAmount) || 0;
  const totalWithCredit = totalPaymentAmount + clientCredit;
  const newRemainingAmount = remainingAmount - totalWithCredit;
  const hasPartialPayment = newRemainingAmount > 0 && totalWithCredit > 0;

  const handleConfirmPayment = () => {
    if (hasPartialPayment) {
      setShowConfirmDialog(true);
    } else {
      submitPayment();
    }
  };

  const submitPayment = () => {
    const validPayments = payments
      .filter(p => p.amount && parseFloat(p.amount) > 0)
      .map(p => ({ method: p.method, amount: parseFloat(p.amount) }));

    if (validPayments.length > 0 || clientCredit > 0) {
      onPayment(appointment.id, validPayments, clientCredit > 0 ? clientCredit : undefined);
      setShowPaymentForm(false);
      setPayments([{ method: 'pix', amount: '' }]);
      setClientCreditAmount('');
      setShowConfirmDialog(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Detalhes do Agendamento
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
                  <Scissors className="h-4 w-4 text-muted-foreground" />
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

              {/* Outstanding Balance Warning */}
              {remainingAmount > 0 && !showPaymentForm && (
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
                      {PAYMENT_METHODS.find(p => p.value === method)?.label || method}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Payment Form */}
              {showPaymentForm ? (
                <div className="space-y-3 p-3 rounded-lg border border-border">
                  {/* Total to pay header */}
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <p className="text-sm text-muted-foreground">Valor a pagar</p>
                    <p className="text-xl font-bold text-primary">R$ {remainingAmount.toFixed(2)}</p>
                  </div>
                  
                  <p className="text-sm font-medium">Registrar Pagamento</p>
                  
                  {payments.map((payment, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label className="text-xs">Forma de Pagamento</Label>
                        <select
                          className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                          value={payment.method}
                          onChange={(e) => updatePayment(index, 'method', e.target.value)}
                        >
                          {PAYMENT_METHODS.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
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
                  ))}

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
                          <span>Valor recebido:</span>
                          <span className="font-semibold text-success">R$ {totalPaymentAmount.toFixed(2)}</span>
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
                        <span>Total a quitar:</span>
                        <span className="font-semibold">R$ {totalWithCredit.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Restante após pagamento:</span>
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              {deleteMode === 'all' ? 'Excluir Todos os Agendamentos do Pacote' : 'Excluir Agendamento'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteMode === 'all' ? (
                <>
                  Tem certeza que deseja excluir <strong>todos os agendamentos</strong> do pacote <strong>{packageData?.name}</strong> de <strong>{appointment.client?.name}</strong>? 
                  <br /><br />
                  Esta ação irá remover todos os agendamentos vinculados a este pacote e resetar as sessões. Esta ação não pode ser desfeita.
                </>
              ) : (
                <>
                  Tem certeza que deseja excluir este agendamento de <strong>{appointment.client?.name}</strong>
                  {appointment.service?.name ? ` para ${appointment.service.name}` : packageData?.name ? ` (Pacote: ${packageData.name})` : ''}? 
                  Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteAppointment.isPending || deletePackageAppointments.isPending}
            >
              {deleteMode === 'all' ? 'Excluir Todos' : 'Excluir'}
            </AlertDialogAction>
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
