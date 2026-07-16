import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { calculateTotalCostPerUse } from '@/lib/productCostCalculation';
import { toast } from 'sonner';

interface CancelPackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string | null;
  onSuccess?: () => void;
}

interface LoadedSale {
  saleId: string;
  packageId: string | null;
  packageName: string;
  clientId: string | null;
  clientName: string;
  paidAmount: number;
  totalSessions: number;
  usedSessions: number;
  isCancelled: boolean;
}

export function CancelPackageDialog({ open, onOpenChange, saleId, onSuccess }: CancelPackageDialogProps) {
  const queryClient = useQueryClient();
  const { paymentMethods } = usePaymentMethods();

  const [costPerApplication, setCostPerApplication] = useState('0');
  const [penalty, setPenalty] = useState('0');
  const [refundMethod, setRefundMethod] = useState('Dinheiro');
  const [cancelReason, setCancelReason] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [autoCostInfo, setAutoCostInfo] = useState<string | null>(null);
  const [calculatingCost, setCalculatingCost] = useState(false);

  const { data: selected } = useQuery<LoadedSale | null>({
    queryKey: ['cancel-package-dialog-sale', saleId],
    enabled: !!saleId && open,
    queryFn: async () => {
      if (!saleId) return null;
      const { data: s, error } = await supabase
        .from('single_sales')
        .select(`
          id, package_id, final_amount, notes,
          client:clients(id, name),
          package:service_packages(
            id, name, total_sessions,
            appointments:package_appointments(id, status)
          )
        `)
        .eq('id', saleId)
        .maybeSingle();
      if (error) throw error;
      if (!s) return null;
      const apps = (s as any).package?.appointments || [];
      const used = apps.filter((a: any) => a.status === 'completed' || a.status === 'missed').length;
      return {
        saleId: s.id,
        packageId: (s as any).package_id || (s as any).package?.id || null,
        packageName: (s as any).package?.name || 'Pacote',
        clientId: (s as any).client?.id || null,
        clientName: (s as any).client?.name || '-',
        paidAmount: Number((s as any).final_amount || 0),
        totalSessions: (s as any).package?.total_sessions || 0,
        usedSessions: used,
        isCancelled: ((s as any).notes || '').toUpperCase().includes('CANCELADO'),
      } as LoadedSale;
    },
  });

  // Reset form + auto-calc when opening
  useEffect(() => {
    if (!open || !selected) return;
    setCostPerApplication('0');
    setPenalty('0');
    setRefundMethod('Dinheiro');
    setCancelReason('');
    setValidationError(null);
    setAutoCostInfo(null);

    if (!selected.packageId) return;
    (async () => {
      setCalculatingCost(true);
      try {
        const { data: pkg } = await supabase
          .from('service_packages')
          .select('id, template_id, service_id')
          .eq('id', selected.packageId!)
          .maybeSingle();
        if (!pkg) return;

        let links: any[] = [];
        let source = '';
        if (pkg.template_id) {
          const { data: tplLinks } = await supabase
            .from('package_template_products')
            .select('quantity_per_use, tracking_method, container_amount, container_unit, estimated_appointments, product:products(unit, unit_price, total_price, quantity_purchased)')
            .eq('template_id', pkg.template_id);
          if (tplLinks && tplLinks.length > 0) { links = tplLinks; source = 'template do pacote'; }
        }
        if (links.length === 0 && pkg.service_id) {
          const { data: srvLinks } = await supabase
            .from('service_products')
            .select('quantity_per_use, tracking_method, container_amount, container_unit, estimated_appointments, product:products(unit, unit_price, total_price, quantity_purchased)')
            .eq('service_id', pkg.service_id);
          if (srvLinks && srvLinks.length > 0) { links = srvLinks; source = 'serviço do pacote'; }
        }
        if (links.length > 0) {
          const cost = calculateTotalCostPerUse(links as any);
          if (cost > 0) {
            setCostPerApplication(cost.toFixed(2));
            setAutoCostInfo(`Custo auto-calculado a partir dos produtos vinculados ao ${source} (${links.length} produto(s)).`);
          } else {
            setAutoCostInfo('Produtos vinculados não possuem preço cadastrado. Informe manualmente.');
          }
        } else {
          setAutoCostInfo('Nenhum produto vinculado a este pacote. Informe o custo manualmente, se aplicável.');
        }
      } catch (e) {
        console.error('[CancelPackageDialog] auto-cost error', e);
      } finally {
        setCalculatingCost(false);
      }
    })();
  }, [open, selected]);

  const refundAmount = useMemo(() => {
    if (!selected) return 0;
    const used = selected.usedSessions;
    const cost = parseFloat(costPerApplication || '0') || 0;
    const pen = parseFloat(penalty || '0') || 0;
    const r = selected.paidAmount - used * cost - pen;
    return Math.max(0, Math.round(r * 100) / 100);
  }, [selected, costPerApplication, penalty]);

  const validate = (): string | null => {
    if (!selected) return 'Pacote não selecionado.';
    const cost = parseFloat(costPerApplication || '0');
    const pen = parseFloat(penalty || '0');
    if (Number.isNaN(cost) || cost < 0) return 'Custo médio por aplicação deve ser um número ≥ 0.';
    if (Number.isNaN(pen) || pen < 0) return 'Multa/Penalidade deve ser um número ≥ 0.';
    if (cost > selected.paidAmount) return 'Custo médio por aplicação não pode ser maior que o valor pago.';
    const totalDeducted = selected.usedSessions * cost + pen;
    if (totalDeducted > selected.paidAmount + 0.01) {
      return `Aplicações usadas + multa (R$ ${totalDeducted.toFixed(2)}) ultrapassam o valor pago (R$ ${selected.paidAmount.toFixed(2)}).`;
    }
    if (refundAmount < 0) return 'Valor de devolução não pode ser negativo.';
    if (!refundMethod?.trim()) return 'Selecione uma forma de devolução.';
    if (!cancelReason.trim() || cancelReason.trim().length < 5) return 'Informe um motivo de cancelamento (mínimo 5 caracteres).';
    return null;
  };

  useEffect(() => {
    if (!open) { setValidationError(null); return; }
    setValidationError(validate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selected, costPerApplication, penalty, refundMethod, cancelReason, refundAmount]);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const err = validate();
      if (err) throw new Error(err);
      if (!selected) throw new Error('Sem pacote selecionado');

      const { data: { user } } = await supabase.auth.getUser();
      const today = format(new Date(), 'yyyy-MM-dd');
      const refundDescription = `Devolução de pacote: ${selected.packageName} - Cliente: ${selected.clientName} - Pagamento: ${refundMethod}`;

      const { data: freshSale, error: saleErr } = await supabase
        .from('single_sales').select('id, notes').eq('id', selected.saleId).single();
      if (saleErr) throw saleErr;
      if (freshSale?.notes && freshSale.notes.toUpperCase().includes('CANCELADO')) {
        throw new Error('Este pacote já foi cancelado.');
      }

      const { data: existingTx } = await supabase
        .from('cash_transactions').select('id')
        .eq('reference_id', selected.saleId).eq('reference_type', 'package_refund').limit(1);
      const refundAlreadyRegistered = (existingTx?.length || 0) > 0;

      if (!refundAlreadyRegistered && refundAmount > 0) {
        const { data: openReg } = await supabase
          .from('cash_registers').select('id').is('closed_at', null)
          .order('opened_at', { ascending: false }).limit(1).maybeSingle();
        if (openReg?.id) {
          await supabase.from('cash_transactions').insert({
            cash_register_id: openReg.id, type: 'expense', category: 'refund',
            description: refundDescription, amount: refundAmount, payment_method: refundMethod,
            reference_id: selected.saleId, reference_type: 'package_refund', created_by: user?.id,
          });
        }
      }

      const refundMarker = `[refund:${selected.saleId}]`;
      const { data: existingFE } = await supabase
        .from('financial_entries').select('id').ilike('description', `%${refundMarker}%`).limit(1);
      const feAlreadyRegistered = (existingFE?.length || 0) > 0;

      if (!feAlreadyRegistered && refundAmount > 0) {
        await supabase.from('financial_entries').insert({
          type: 'expense',
          description: `${refundDescription} ${refundMarker}`,
          amount: refundAmount, status: 'paid', due_date: today, paid_date: today,
          client_id: selected.clientId,
          notes: `Devolução de pacote cancelado - Aplicações usadas: ${selected.usedSessions} - Multa: R$ ${penalty} - Motivo: ${cancelReason.trim()}`,
          created_by: user?.id,
        });
      }

      if (!refundAlreadyRegistered && refundMethod.toLowerCase().includes('crédito') && selected.clientId && refundAmount > 0) {
        const { data: cli } = await supabase.from('clients').select('credit_balance').eq('id', selected.clientId).single();
        const newBalance = Number(cli?.credit_balance || 0) + refundAmount;
        await supabase.from('clients').update({ credit_balance: newBalance }).eq('id', selected.clientId);
      }

      await supabase.from('single_sales').update({
        notes: `CANCELADO - Devolução: R$ ${refundAmount.toFixed(2)} em ${today} via ${refundMethod} - Motivo: ${cancelReason.trim()}`,
      }).eq('id', selected.saleId);

      if (selected.packageId) {
        const { error: purgeErr } = await (supabase as any).rpc('hard_purge_service_package', {
          _package_id: selected.packageId,
        });
        if (purgeErr) throw purgeErr;
      }

      return { refundAmount, alreadyRegistered: refundAlreadyRegistered && feAlreadyRegistered };
    },
    onSuccess: (data) => {
      if (data.alreadyRegistered) toast.info('Cancelamento já havia sido registrado anteriormente.');
      else toast.success(`Pacote excluído permanentemente. Devolução de R$ ${data.refundAmount.toFixed(2)} registrada.`);
      onOpenChange(false);
      [
        'package-sales-financial', 'appointments', 'service_packages', 'cash_transactions',
        'financial_entries', 'client-profile', 'clients', 'client_packages',
        'client_packages_with_counts', 'package_appointments', 'single_sales', 'client_credits',
      ].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      onSuccess?.();
    },
    onError: (e: any) => {
      console.error(e);
      toast.error(`Erro ao cancelar pacote: ${e.message || 'tente novamente'}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Cancelar Pacote</DialogTitle>
          <DialogDescription className="text-xs">
            {selected?.packageName} - {selected?.clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-muted rounded">
              <p className="text-muted-foreground text-[10px]">Aplicações utilizadas</p>
              <p className="font-bold">{selected?.usedSessions} de {selected?.totalSessions}</p>
            </div>
            <div className="p-2 bg-muted rounded">
              <p className="text-muted-foreground text-[10px]">Valor pago</p>
              <p className="font-bold">R$ {selected?.paidAmount.toFixed(2)}</p>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              Custo de material por aplicação (R$)
              {calculatingCost && <span className="text-[10px] text-muted-foreground">(calculando...)</span>}
            </Label>
            <Input type="number" step="0.01" value={costPerApplication}
              onChange={(e) => { setCostPerApplication(e.target.value); setAutoCostInfo(null); }}
              className="h-8 text-xs" />
            {autoCostInfo && (
              <p className="text-[10px] text-emerald-600 flex items-start gap-1">
                <Sparkles className="h-3 w-3 shrink-0 mt-0.5" />
                <span>{autoCostInfo}</span>
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Multa/Penalidade (R$)</Label>
            <Input type="number" step="0.01" value={penalty}
              onChange={(e) => setPenalty(e.target.value)} className="h-8 text-xs" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Forma de devolução ao cliente</Label>
            <Select value={refundMethod} onValueChange={setRefundMethod}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(() => {
                  const base = ['Dinheiro', 'PIX', 'Transferência', 'Crédito em Conta'];
                  const extras = paymentMethods.map(m => m.name)
                    .filter(n => !n.toLowerCase().includes('boleto'))
                    .filter(n => !base.some(b => b.toLowerCase() === n.toLowerCase()));
                  const all = [...base, ...extras];
                  const seen = new Set<string>();
                  return all.filter(n => {
                    const k = n.toLowerCase().trim();
                    if (seen.has(k)) return false;
                    seen.add(k); return true;
                  }).map(n => (
                    <SelectItem key={n} value={n} className="text-xs">
                      {n === 'Crédito em Conta' ? 'Crédito em Conta do Cliente' : n}
                    </SelectItem>
                  ));
                })()}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Motivo do cancelamento *</Label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Descreva o motivo (mínimo 5 caracteres)..." className="text-xs min-h-[60px]" />
          </div>

          <div className="p-3 bg-primary/10 rounded space-y-1">
            <p className="text-xs text-muted-foreground">Valor a devolver ao cliente:</p>
            <p className="text-lg font-bold text-primary">R$ {refundAmount.toFixed(2)}</p>
          </div>

          {validationError && (
            <div className="p-2 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive">
              {validationError}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            ⚠️ Ao confirmar, o pacote é excluído em cascata (venda em Pacotes, aplicações e agendamentos vinculados), preservando o histórico já realizado e o lançamento de devolução no caixa/financeiro.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Voltar</Button>
          <Button variant="destructive" size="sm" onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending || !!validationError}>
            {cancelMutation.isPending ? 'Processando...' : 'Confirmar Cancelamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
