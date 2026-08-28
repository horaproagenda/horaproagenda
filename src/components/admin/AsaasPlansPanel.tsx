import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveTable, type ResponsiveColumn } from '@/components/ui/responsive-table';
import { supabase } from '@/integrations/supabase/client';
import { BILLING_PERIODS, PLANS, formatBRL, periodTotal } from '@/lib/plans';

interface PlanRow {
  seats: number;
  months: number;
  cycleLabel: string;
  totalBRL: number;
  url: string | null;
  published: boolean;
}

interface LinkRecord {
  seats: number;
  billing_months: number;
  url: string | null;
  active: boolean;
}

/**
 * Planos publicados no Asaas como links de assinatura (cartão de crédito,
 * cartão de débito, Pix e boleto). Só apresentação: os valores vêm da tabela
 * oficial e a criação/atualização acontece no backend.
 */
export function AsaasPlansPanel() {
  const queryClient = useQueryClient();
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  const { data: links = [], isLoading } = useQuery({
    queryKey: ['billing-payment-links'],
    queryFn: async (): Promise<LinkRecord[]> => {
      const { data, error } = await supabase
        .from('billing_payment_links')
        .select('seats, billing_months, url, active');
      if (error) throw error;
      return (data ?? []) as LinkRecord[];
    },
  });

  const rows: PlanRow[] = PLANS.flatMap((plan) =>
    BILLING_PERIODS.map((period) => {
      const record = links.find(
        (l) => l.seats === plan.seats && l.billing_months === period.months,
      );
      return {
        seats: plan.seats,
        months: period.months,
        cycleLabel: period.label,
        totalBRL: periodTotal(plan.priceBRL, period.months),
        url: record?.url ?? null,
        published: !!record?.active && !!record?.url,
      };
    }),
  );

  const sync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('asaas-sync-payment-links');
      if (error) throw error;
      return data as { total: number; created: number; updated: number; failed: number };
    },
    onSuccess: (data) => {
      setLastSummary(
        `${data.created} criado(s), ${data.updated} atualizado(s), ${data.failed} com falha de ${data.total}.`,
      );
      toast.success('Planos sincronizados com o Asaas');
      queryClient.invalidateQueries({ queryKey: ['billing-payment-links'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Não foi possível sincronizar os planos');
    },
  });

  const columns: ResponsiveColumn<PlanRow>[] = [
    {
      key: 'plan',
      header: 'Plano',
      cell: (row) => (
        <span className="font-medium">
          {row.seats} usuário(s) · {row.cycleLabel}
        </span>
      ),
      hideLabelOnCard: true,
    },
    {
      key: 'value',
      header: 'Valor do ciclo',
      priority: 'secondary',
      cell: (row) => formatBRL(row.totalBRL),
    },
    {
      key: 'status',
      header: 'Status',
      priority: 'secondary',
      cell: (row) =>
        row.published ? (
          <Badge variant="secondary" className="text-[11px]">Publicado</Badge>
        ) : (
          <Badge variant="outline" className="text-[11px]">Não publicado</Badge>
        ),
    },
    {
      key: 'actions',
      header: 'Link',
      priority: 'actions',
      hideLabelOnCard: true,
      cell: (row) =>
        row.url ? (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              onClick={() => {
                navigator.clipboard.writeText(row.url as string);
                toast.success('Link copiado');
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2" asChild>
              <a href={row.url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <Card>
      <CardHeader className="stack-mobile gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Planos no Asaas</CardTitle>
          <CardDescription className="text-xs">
            Links de assinatura para venda fora do app — o cliente escolhe cartão de crédito,
            cartão de débito, Pix ou boleto. A renovação automática só acontece com cartão de
            crédito; em Pix e boleto o Asaas envia a fatura de cada ciclo.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="w-full sm:w-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${sync.isPending ? 'animate-spin' : ''}`} />
          {sync.isPending ? 'Sincronizando…' : 'Sincronizar planos'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {lastSummary && <p className="text-xs text-muted-foreground">{lastSummary}</p>}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando planos…</p>
        ) : (
          <ResponsiveTable
            data={rows}
            columns={columns}
            getRowKey={(row) => `${row.seats}-${row.months}`}
            emptyMessage="Nenhum plano configurado"
          />
        )}
      </CardContent>
    </Card>
  );
}
