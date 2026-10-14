export interface LedgerEntry { amount: number; paidDate: string | null; methodName: string | null }

export interface ResolvePackagePaymentInput {
  /** Recebido pela própria venda (paid_at ou parcelas de boleto pagas). */
  salePaid: number;
  hasBoleto: boolean;
  /** Maior amount_paid replicado nas sessões. */
  sessionPaid: number;
  finalAmount: number;
  salePaymentMethodName: string | null;
  saleDate: string;
  /** Lançamentos financeiros pagos ligados à venda ou às sessões do pacote. */
  ledger: LedgerEntry[];
}

export interface ResolvedPackagePayment {
  paidAmount: number;
  paymentMethodName: string;
  paymentDate: string;
  /** Sessões marcadas como pagas sem lançamento financeiro correspondente. */
  ledgerMissing: boolean;
}

/**
 * Fonte única do "pago" de um pacote: o livro financeiro.
 * Valor só nas sessões, sem lançamento, NÃO conta como pago e vira alerta.
 */
export function resolvePackagePayment(i: ResolvePackagePaymentInput): ResolvedPackagePayment {
  const ledgerPaid = i.ledger.reduce((s, e) => s + Number(e.amount || 0), 0);
  const ledgerMethods = [...new Set(i.ledger.map((e) => e.methodName).filter(Boolean))] as string[];
  const ledgerDates = i.ledger.map((e) => e.paidDate).filter(Boolean).sort() as string[];

  if (i.salePaid > 0 || i.hasBoleto) {
    return {
      paidAmount: i.salePaid,
      paymentMethodName: i.salePaymentMethodName || ledgerMethods.join(', ') || '-',
      paymentDate: ledgerDates[0] || i.saleDate,
      ledgerMissing: false,
    };
  }
  if (ledgerPaid > 0) {
    return {
      paidAmount: Number(Math.min(ledgerPaid, i.finalAmount || ledgerPaid).toFixed(2)),
      paymentMethodName: ledgerMethods.join(', ') || i.salePaymentMethodName || '-',
      paymentDate: ledgerDates[0] || i.saleDate,
      ledgerMissing: false,
    };
  }
  return {
    paidAmount: 0,
    paymentMethodName: i.salePaymentMethodName || '-',
    paymentDate: i.saleDate,
    ledgerMissing: i.sessionPaid > 0,
  };
}

/** Vendas de pacote que realmente registraram pagamento (podem esconder o pagamento feito pela agenda). */
export function paidPackageSaleIds(sales: { package_id?: string | null; paid_at?: string | null; notes?: string | null; final_amount?: number | null; boleto_installments?: { status: string; paid_date?: string | null }[] }[]): Set<string> {
  const ids = new Set<string>();
  for (const s of sales) {
    if (!s.package_id) continue;
    if ((s.notes || '').includes('CANCELADO') || Number(s.final_amount || 0) === 0) continue;
    const paidInst = (s.boleto_installments || []).some((b) => b.status === 'paid' && b.paid_date);
    if (s.paid_at || paidInst) ids.add(s.package_id);
  }
  return ids;
}
