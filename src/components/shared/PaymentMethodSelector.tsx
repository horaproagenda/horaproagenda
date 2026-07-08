import { useState, useEffect, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { useCardBrands } from '@/hooks/useCardBrands';
import { useBanks } from '@/hooks/useBanks';
import { isClientCreditPaymentMethod } from '@/lib/clientCreditPayment';

interface PaymentMethodSelectorProps {
  paymentMethodId: string;
  onPaymentMethodChange: (id: string) => void;
  cardBrandId?: string;
  onCardBrandChange?: (id: string) => void;
  installments?: number;
  onInstallmentsChange?: (installments: number) => void;
  bankId?: string;
  onBankChange?: (id: string) => void;
  amount: number;
  onFeeCalculated?: (fee: number, netAmount: number) => void;
  showBankSelector?: boolean;
  compact?: boolean;
}

export function PaymentMethodSelector({
  paymentMethodId,
  onPaymentMethodChange,
  cardBrandId = '',
  onCardBrandChange,
  installments = 1,
  onInstallmentsChange,
  bankId = '',
  onBankChange,
  amount,
  onFeeCalculated,
  showBankSelector = false,
  compact = false,
}: PaymentMethodSelectorProps) {
  const { activePaymentMethods } = usePaymentMethods();
  const { activeCardBrands, creditBrands, debitBrands } = useCardBrands();
  const { activeBanks } = useBanks();

  const selectedPaymentMethod = useMemo(
    () => activePaymentMethods.find(m => m.id === paymentMethodId),
    [activePaymentMethods, paymentMethodId]
  );

  // Determine if it's a card payment
  const isCardPayment = useMemo(() => {
    if (!selectedPaymentMethod) return false;
    const name = selectedPaymentMethod.name.toLowerCase();
    return name.includes('crédito') || name.includes('débito') || name.includes('cartão');
  }, [selectedPaymentMethod]);

  const isCreditCard = useMemo(() => {
    if (!selectedPaymentMethod) return false;
    return selectedPaymentMethod.name.toLowerCase().includes('crédito');
  }, [selectedPaymentMethod]);

  const isDebitCard = useMemo(() => {
    if (!selectedPaymentMethod) return false;
    return selectedPaymentMethod.name.toLowerCase().includes('débito');
  }, [selectedPaymentMethod]);

  // Get applicable card brands based on payment type
  const applicableCardBrands = useMemo(() => {
    if (isCreditCard) {
      return activeCardBrands.filter(b => b.type === 'credit' || b.type === 'both');
    }
    if (isDebitCard) {
      return activeCardBrands.filter(b => b.type === 'debit' || b.type === 'both');
    }
    return activeCardBrands;
  }, [activeCardBrands, isCreditCard, isDebitCard]);

  // Get selected card brand
  const selectedCardBrand = useMemo(
    () => activeCardBrands.find(b => b.id === cardBrandId),
    [activeCardBrands, cardBrandId]
  );

  // Get max installments from payment method or card brand
  const maxInstallments = useMemo(() => {
    if (!isCardPayment) return 1;
    if (isDebitCard) return 1; // Debit is always 1x
    
    // Use payment method max installments or default to 12
    return selectedPaymentMethod?.max_installments || 12;
  }, [selectedPaymentMethod, isCardPayment, isDebitCard]);

  // Calculate fee based on card brand and installments
  const feeInfo = useMemo(() => {
    if (!selectedCardBrand || !amount) {
      return { feePercentage: 0, feeAmount: 0, netAmount: amount };
    }

    // Find fee for current installment count
    const fees = selectedCardBrand.fees || [];
    let feePercentage = 0;

    // Find exact match or closest lower installment
    const sortedFees = [...fees].sort((a, b) => b.installment_number - a.installment_number);
    const matchingFee = sortedFees.find(f => f.installment_number <= installments);
    
    if (matchingFee) {
      feePercentage = matchingFee.fee_percentage;
    }

    const feeAmount = (amount * feePercentage) / 100;
    const netAmount = selectedCardBrand.fee_behavior === 'deduct_from_provider'
      ? amount - feeAmount
      : amount;

    return { feePercentage, feeAmount, netAmount };
  }, [selectedCardBrand, amount, installments]);

  // Notify parent of fee calculation
  useEffect(() => {
    if (onFeeCalculated) {
      onFeeCalculated(feeInfo.feeAmount, feeInfo.netAmount);
    }
  }, [feeInfo, onFeeCalculated]);

  // Reset card brand when payment method changes
  useEffect(() => {
    if (!isCardPayment && onCardBrandChange) {
      onCardBrandChange('');
    }
    if (!isCardPayment && onInstallmentsChange) {
      onInstallmentsChange(1);
    }
  }, [isCardPayment, onCardBrandChange, onInstallmentsChange]);

  const gridCols = compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';

  return (
    <div className="space-y-4">
      <div className={`grid ${gridCols} gap-4`}>
        {/* Payment Method */}
        <div className="space-y-2">
          <Label>Forma de Pagamento</Label>
          <Select value={paymentMethodId} onValueChange={onPaymentMethodChange}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {activePaymentMethods.map((method) => (
                <SelectItem key={method.id} value={method.id}>
                  {method.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Card Brand - Only show for card payments */}
        {isCardPayment && onCardBrandChange && (
          <div className="space-y-2">
            <Label>Bandeira do Cartão</Label>
            <Select value={cardBrandId} onValueChange={onCardBrandChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a bandeira..." />
              </SelectTrigger>
              <SelectContent>
                {applicableCardBrands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Installments - Only show for credit card */}
        {isCreditCard && onInstallmentsChange && maxInstallments > 1 && (
          <div className="space-y-2">
            <Label>Parcelas</Label>
            <Select 
              value={installments.toString()} 
              onValueChange={(v) => onInstallmentsChange(parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => (
                  <SelectItem key={n} value={n.toString()}>
                    {n}x {amount > 0 && `R$ ${(amount / n).toFixed(2)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Bank - Optional */}
        {showBankSelector && onBankChange && (
          <div className="space-y-2">
            <Label>Banco</Label>
            <Select value={bankId} onValueChange={onBankChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o banco..." />
              </SelectTrigger>
              <SelectContent>
                {activeBanks.map((bank) => (
                  <SelectItem key={bank.id} value={bank.id}>
                    {bank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Fee Information */}
      {selectedCardBrand && feeInfo.feePercentage > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline" className="text-amber-600 border-amber-300">
            Taxa: {feeInfo.feePercentage.toFixed(2)}%
          </Badge>
          <span className="text-muted-foreground">
            Valor da taxa: R$ {feeInfo.feeAmount.toFixed(2)}
          </span>
          {selectedCardBrand.fee_behavior === 'deduct_from_provider' && (
            <span className="text-muted-foreground">
              • Valor líquido: <strong className="text-foreground">R$ {feeInfo.netAmount.toFixed(2)}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
