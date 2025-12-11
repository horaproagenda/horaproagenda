import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
} from 'lucide-react';
import { Appointment, Professional } from '@/types';
import { cn } from '@/lib/utils';

interface AppointmentDetailDialogProps {
  appointment: Appointment | null;
  professionals: Professional[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPayment: (appointmentId: string, paymentMethods: { method: string; amount: number }[]) => void;
}

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'debit_card', label: 'Cartão de Débito' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'bank_transfer', label: 'Transferência' },
];

const statusConfig = {
  scheduled: { label: 'Agendado', className: 'bg-info/10 text-info border-info/20' },
  confirmed: { label: 'Confirmado', className: 'bg-success/10 text-success border-success/20' },
  completed: { label: 'Concluído', className: 'bg-muted text-muted-foreground border-muted' },
  cancelled: { label: 'Cancelado', className: 'bg-destructive/10 text-destructive border-destructive/20' },
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
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payments, setPayments] = useState<{ method: string; amount: string }[]>([
    { method: 'pix', amount: '' },
  ]);

  if (!appointment) return null;

  const professionalId = appointment.professional_id || appointment.service?.professional_id;
  const professional = professionals.find(p => p.id === professionalId) || appointment.service?.professional;
  const status = statusConfig[appointment.status];
  const paymentStatus = paymentStatusConfig[appointment.payment_status || 'pending'];
  const PaymentIcon = paymentStatus.icon;
  const totalPrice = appointment.service?.price || 0;
  const amountPaid = appointment.amount_paid || 0;
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

  const handleSubmitPayment = () => {
    const validPayments = payments
      .filter(p => p.amount && parseFloat(p.amount) > 0)
      .map(p => ({ method: p.method, amount: parseFloat(p.amount) }));

    if (validPayments.length > 0) {
      onPayment(appointment.id, validPayments);
      setShowPaymentForm(false);
      setPayments([{ method: 'pix', amount: '' }]);
    }
  };

  const totalPaymentAmount = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

  return (
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
            <Badge variant="outline" className={cn('text-xs', status.className)}>
              {status.label}
            </Badge>
          </div>

          {/* Service Info */}
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

                {totalPaymentAmount > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Total a registrar: <span className="font-semibold">R$ {totalPaymentAmount.toFixed(2)}</span>
                  </p>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowPaymentForm(false)} className="flex-1">
                    Cancelar
                  </Button>
                  <Button onClick={handleSubmitPayment} className="flex-1" disabled={totalPaymentAmount <= 0}>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
