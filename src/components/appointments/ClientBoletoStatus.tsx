import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  clientId: string | null | undefined;
  /** Service ID of the current appointment, when applicable */
  serviceId?: string | null;
  /** Package ID of the current appointment, when applicable */
  packageId?: string | null;
}

/**
 * Shows the boleto installments status ONLY when the service/package being
 * displayed in the appointment was actually sold to the client via a
 * "boleto parcelado" sale. If the appointment is for an item the client did
 * not purchase via boleto, this component renders nothing.
 */
export function ClientBoletoStatus({ clientId, serviceId, packageId }: Props) {
  const { data } = useQuery({
    queryKey: ['client_boleto_status_for_item', clientId, serviceId || null, packageId || null],
    queryFn: async () => {
      if (!clientId) return null;
      if (!serviceId && !packageId) return null;

      // Find sales for THIS client that match the service/package of the appointment
      let salesQuery = supabase
        .from('single_sales')
        .select('id, service_id, package_id')
        .eq('client_id', clientId);

      if (packageId) {
        salesQuery = salesQuery.eq('package_id', packageId);
      } else if (serviceId) {
        salesQuery = salesQuery.eq('service_id', serviceId);
      }

      const { data: sales } = await salesQuery;
      const saleIds = (sales || []).map((s) => s.id);
      if (!saleIds.length) return null;

      // Only show if at least one of those sales has boleto installments
      const { data: insts } = await supabase
        .from('boleto_installments')
        .select('status, amount, due_date')
        .in('sale_id', saleIds);

      if (!insts || insts.length === 0) return null;

      const today = new Date().toISOString().split('T')[0];
      let pending = 0;
      let overdue = 0;
      let pendingAmount = 0;
      let overdueAmount = 0;
      insts.forEach((i: any) => {
        if (i.status === 'paid' || i.status === 'cancelled') return;
        if (i.due_date < today || i.status === 'overdue') {
          overdue++;
          overdueAmount += Number(i.amount) || 0;
        } else {
          pending++;
          pendingAmount += Number(i.amount) || 0;
        }
      });
      return { total: insts.length, pending, overdue, pendingAmount, overdueAmount };
    },
    enabled: !!clientId && (!!serviceId || !!packageId),
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
