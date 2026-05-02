import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  clientId: string | null | undefined;
}

/**
 * Shows the boleto installments status for a given client inside the
 * appointment dialog. Displays whether the client has open / overdue boletos.
 */
export function ClientBoletoStatus({ clientId }: Props) {
  const { data } = useQuery({
    queryKey: ['client_boleto_status', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data: sales } = await supabase
        .from('single_sales')
        .select('id')
        .eq('client_id', clientId);
      const saleIds = (sales || []).map(s => s.id);
      if (!saleIds.length) return { total: 0, pending: 0, overdue: 0, overdueAmount: 0, pendingAmount: 0 };

      const { data: insts } = await supabase
        .from('boleto_installments')
        .select('status, amount, due_date')
        .in('sale_id', saleIds);

      const today = new Date().toISOString().split('T')[0];
      let pending = 0, overdue = 0, pendingAmount = 0, overdueAmount = 0;
      (insts || []).forEach((i: any) => {
        if (i.status === 'paid' || i.status === 'cancelled') return;
        if (i.due_date < today || i.status === 'overdue') {
          overdue++; overdueAmount += Number(i.amount) || 0;
        } else {
          pending++; pendingAmount += Number(i.amount) || 0;
        }
      });
      return { total: insts?.length || 0, pending, overdue, pendingAmount, overdueAmount };
    },
    enabled: !!clientId,
    staleTime: 30_000,
  });

  if (!data || data.total === 0) return null;

  if (data.overdue > 0) {
    return (
      <Alert className="border-red-500 bg-red-50 dark:bg-red-950/30">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-xs text-red-700 dark:text-red-400">
          <strong>Cliente paga por boleto parcelado.</strong> Possui <strong>{data.overdue}</strong> boleto(s) vencido(s) sem pagamento — total R$ {data.overdueAmount.toFixed(2)}.
        </AlertDescription>
      </Alert>
    );
  }

  if (data.pending > 0) {
    return (
      <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950/30">
        <FileText className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-xs text-blue-700 dark:text-blue-400">
          <strong>Cliente paga por boleto parcelado.</strong> Pagamentos em dia — {data.pending} parcela(s) pendente(s) totalizando R$ {data.pendingAmount.toFixed(2)}.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="border-green-500 bg-green-50 dark:bg-green-950/30">
      <CheckCircle2 className="h-4 w-4 text-green-600" />
      <AlertDescription className="text-xs text-green-700 dark:text-green-400">
        <strong>Cliente paga por boleto parcelado.</strong> Todas as parcelas quitadas.
      </AlertDescription>
    </Alert>
  );
}
