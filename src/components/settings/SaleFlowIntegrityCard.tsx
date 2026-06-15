import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface OrphanGroup {
  key: string;
  label: string;
  items: any[];
}

/**
 * Painel "Integridade do fluxo financeiro/agenda".
 * Detecta vendas-fantasma, pacotes/serviços/lançamentos sem venda ativa
 * (ex.: boletos apagados sem cleanup) e oferece limpeza definitiva via
 * RPC purge_single_sale_cascade.
 */
export function SaleFlowIntegrityCard() {
  const qc = useQueryClient();
  const [purgingId, setPurgingId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['sale-flow-integrity'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('audit_sale_flow_integrity');
      if (error) throw error;
      return data as Record<string, any[]>;
    },
    staleTime: 0,
  });

  const groups: OrphanGroup[] = [
    { key: 'sales_with_boleto_no_installments', label: 'Vendas de boleto sem nenhuma parcela', items: data?.sales_with_boleto_no_installments || [] },
    { key: 'packages_without_active_sale', label: 'Pacotes vendidos sem venda ativa', items: data?.packages_without_active_sale || [] },
    { key: 'client_services_without_sale', label: 'Serviços disponíveis sem venda ativa', items: data?.client_services_without_sale || [] },
    { key: 'financial_entries_without_sale', label: 'Lançamentos financeiros órfãos', items: data?.financial_entries_without_sale || [] },
  ];

  const totalIssues = groups.reduce((sum, g) => sum + g.items.length, 0);

  const purgeSale = async (saleId: string) => {
    setPurgingId(saleId);
    try {
      const { error } = await (supabase as any).rpc('purge_single_sale_cascade', { _sale_id: saleId });
      if (error) throw error;
      toast.success('Venda removida e fluxo sincronizado.');
      await refetch();
      qc.invalidateQueries({ queryKey: ['single_sales'] });
      qc.invalidateQueries({ queryKey: ['client-sales'] });
      qc.invalidateQueries({ queryKey: ['service_packages'] });
      qc.invalidateQueries({ queryKey: ['client_services'] });
      qc.invalidateQueries({ queryKey: ['financial_entries'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['package_appointments'] });
    } catch (e: any) {
      toast.error(e.message || 'Falha ao limpar venda');
    } finally {
      setPurgingId(null);
    }
  };

  return (
    <Card className="card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-medium">Integridade Financeiro × Agenda</CardTitle>
              <CardDescription className="text-xs">
                Detecta vendas, pacotes, serviços disponíveis e lançamentos órfãos e permite limpeza completa.
              </CardDescription>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-8">
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Reverificar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando diagnóstico…</p>
        ) : totalIssues === 0 ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            ✓ Nenhuma inconsistência encontrada. Vendas, boletos, pacotes, agendamentos e financeiro estão sincronizados.
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => g.items.length > 0 && (
              <div key={g.key} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="text-[10px]">{g.items.length}</Badge>
                  <span className="text-xs font-medium">{g.label}</span>
                </div>
                <div className="space-y-1 pl-1">
                  {g.items.slice(0, 20).map((it: any) => (
                    <div key={it.id} className="flex items-center justify-between gap-2 text-[11px] p-1.5 rounded border bg-muted/30">
                      <span className="font-mono truncate text-muted-foreground">{it.id}</span>
                      <span className="truncate">
                        {it.description || it.name || (it.final_amount != null ? `R$ ${Number(it.final_amount).toFixed(2)}` : '')}
                      </span>
                      {g.key === 'sales_with_boleto_no_installments' && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 px-2"
                          onClick={() => purgeSale(it.id)}
                          disabled={purgingId === it.id}
                        >
                          {purgingId === it.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Trash2 className="h-3 w-3" />}
                        </Button>
                      )}
                    </div>
                  ))}
                  {g.items.length > 20 && (
                    <p className="text-[10px] text-muted-foreground">+ {g.items.length - 20} item(ns) não mostrados</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
