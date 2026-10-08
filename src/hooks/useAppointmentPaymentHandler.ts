import { useCallback } from 'react';
import { toast } from 'sonner';
import { cardFeePercentage } from '@/lib/cardBrandVariants';
import { formatCurrency } from '@/lib/utils';
import { derivePaymentStatus } from '@/lib/paymentStatus';
import { useAppointments } from '@/hooks/useAppointments';
import { useCardBrands } from '@/hooks/useCardBrands';
import type { Appointment, PaymentStatus } from '@/types';

/**
 * Fluxo ÚNICO de baixa de pagamento de agendamento. Usado pela Agenda e pelo
 * Perfil do Cliente — corrigir aqui corrige em todos os lugares.
 */
export function useAppointmentPaymentHandler(appointments: Appointment[]) {
  const { updatePayment } = useAppointments();
  const { activeCardBrands } = useCardBrands();

  return useCallback((
    appointmentId: string, 
    paymentMethods: { method: string; amount: number; cardBrandId?: string; installments?: number }[], 
    clientCredit?: number, // Saldo: troco real registrado no caixa/financeiro (excess becomes client credit)
    courtesyCredit?: number, // Cortesia: brinde sem entrada financeira
    cashRegisterId?: string,
    usedClientCredit?: number,
    discountApplied?: number, // Desconto aplicado
    usedClientCreditMethod?: string,
    additionalItems: Array<{
      item_type: 'service' | 'product';
      service_id?: string | null;
      product_id?: string | null;
      quantity: number;
      unit_price: number;
      total_amount: number;
    }> = []
  ) => {
    const appointment = appointments.find(a => a.id === appointmentId);
    if (!appointment) return;

    // Calculate the correct total price based on appointment type
    const packageData = appointment.package_appointment?.package;
    // Reconhece pacote também quando o vínculo não veio carregado (snapshot/observações),
    // para não usar o preço da sessão no lugar do preço do pacote.
    const packageNameSnapshot = (appointment as any).package_name_snapshot as string | null | undefined;
    const isPackageAppointment = !!appointment.package_appointment || !!packageNameSnapshot;
    const resolvedPackageTotal = Number(packageData?.total_price || 0) || (
      isPackageAppointment
        ? Math.max(
            ...appointments
              .filter((item) => (
                (packageData?.id && item.package_appointment?.package_id === packageData.id) ||
                (!!packageNameSnapshot && (item as any).package_name_snapshot === packageNameSnapshot && item.client_id === appointment.client_id)
              ))
              .map((item) => Number(item.package_appointment?.package?.total_price || 0)),
            0
          )
        : 0
    );

    // For package appointments, use the FULL package price, not per session
    const baseTotalPrice = isPackageAppointment 
      ? resolvedPackageTotal
      : (appointment.service?.price || 0);
    const existingAdditionalTotal = (appointment.additional_items || []).reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const newAdditionalTotal = additionalItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const totalPrice = baseTotalPrice + existingAdditionalTotal + newAdditionalTotal;

    const paymentTotal = paymentMethods.reduce((sum, p) => sum + p.amount, 0);
    const saldoToAdd = clientCredit || 0; // Saldo: real money as credit (registered in cash/financial)
    const courtesyToAdd = courtesyCredit || 0; // Cortesia: gift without financial entry
    const creditUsed = usedClientCredit || 0;
    const discount = discountApplied || 0;
    const availableCredit = Number(appointment.client?.credit_balance || 0);
    
    // CRITICAL FIX: Calculate the actual amount to record as paid
    // Apply discount first, then check for overpayment
    const priceAfterDiscount = Math.max(0, totalPrice - discount);
    const existingPaid = isPackageAppointment && appointment.package_appointment?.package_id
      ? Math.max(
          ...appointments
            .filter((item) => item.package_appointment?.package_id === appointment.package_appointment?.package_id)
            .map((item) => Number(item.amount_paid || 0)),
          Number(appointment.amount_paid || 0),
          0
        )
      : Number(appointment.amount_paid || 0);
    const remainingToPay = Math.max(0, priceAfterDiscount - existingPaid);

    if (creditUsed > Math.min(availableCredit, remainingToPay)) {
      toast.error(`Crédito ao cliente limitado a ${formatCurrency(Math.min(availableCredit, remainingToPay))} para este pagamento.`);
      return;
    }
    
    // Check if this is an overpayment with change return scenario
    const effectivePayment = creditUsed + paymentTotal;
    const isOverpaymentWithChange = effectivePayment > remainingToPay && saldoToAdd === 0;
    
    // The amount actually owed to the procedure
    const actualAmountForProcedure = isOverpaymentWithChange
      ? remainingToPay  // Only count what was actually owed
      : Math.min(effectivePayment, remainingToPay);  // Normal case: count what was paid up to remaining
    
    const totalPaid = existingPaid + actualAmountForProcedure + saldoToAdd + courtesyToAdd;
    
    const existingMethods = appointment.payment_methods || [];
    const newMethods = [...new Set([
      ...existingMethods,
      ...paymentMethods.map(p => p.method),
      ...(creditUsed > 0 && usedClientCreditMethod ? [usedClientCreditMethod] : []),
    ])];
    
    // Calculate total card fees from payments
    let totalCardFee = 0;
    let primaryInstallments = 1;
    let primaryPaymentMethodName = '';
    paymentMethods.forEach(p => {
      // Track the first payment method name
      if (!primaryPaymentMethodName && p.method) {
        primaryPaymentMethodName = p.method;
      }
      
      if (p.cardBrandId && p.amount > 0) {
        const cardBrand = activeCardBrands.find(b => b.id === p.cardBrandId);
        if (cardBrand) {
          const fees = cardBrand.fees || [];
          const installments = p.installments || 1;
          void fees;
          const feePercentage = cardFeePercentage(cardBrand, installments);
          const feeAmount = (p.amount * feePercentage) / 100;
          
          // Only count fee if it's deducted from provider
          if (cardBrand.fee_behavior === 'deduct_from_provider') {
            totalCardFee += feeAmount;
          }
          
          if (installments > primaryInstallments) {
            primaryInstallments = installments;
          }
        }
      }
    });
    
    // Regra única de status (mesma usada no diálogo e no servidor):
    // desconto abate o valor devido e nunca deixa saldo em aberto.
    const paymentStatus: PaymentStatus = derivePaymentStatus({
      price: totalPrice,
      discount,
      amountPaid: totalPaid,
    });

    // For the edge function, send the actual procedure value, not excess
    const amountToSendToBackend = isOverpaymentWithChange
      ? existingPaid + actualAmountForProcedure // Send just procedure value
      : totalPaid;

    updatePayment.mutate({
      id: appointmentId,
      payment: {
        payment_methods: newMethods,
        amount_paid: amountToSendToBackend,
        payment_delta: actualAmountForProcedure + saldoToAdd + courtesyToAdd,
        payment_status: paymentStatus,
        additional_items: additionalItems,
        client_credit: saldoToAdd > 0 ? saldoToAdd : undefined, // Saldo: registered in cash/financial
        courtesy_credit: courtesyToAdd > 0 ? courtesyToAdd : undefined, // Cortesia: NOT registered in cash/financial
        used_client_credit: creditUsed > 0 ? creditUsed : undefined,
        client_id: appointment.client_id,
        cash_register_id: cashRegisterId,
        card_fee_amount: totalCardFee > 0 ? totalCardFee : undefined,
        installments: primaryInstallments > 1 ? primaryInstallments : undefined,
        discount_amount: discount > 0 ? discount : undefined,
        payment_method_name: primaryPaymentMethodName || undefined,
      },
    });
  }, [appointments, activeCardBrands, updatePayment]);
}
