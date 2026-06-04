import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useAccountSubscription } from "@/hooks/useAccountSubscription";
import { PLANS, formatBRL, BILLING_PERIODS, periodTotal } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, Users, CreditCard, Loader2, Settings2, Sparkles, QrCode, FileText } from "lucide-react";

export function AssinaturaSection() {
  const { user } = useAuth();
  const { subscription, trialDaysLeft } = useAccountSubscription();
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
  const [billingMonths, setBillingMonths] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const currentPriceId = subscription?.stripe_price_id ?? null;
  const isActive = subscription?.status === 'active';
  const isGrandfathered = subscription?.is_grandfathered;
  const isTrial = subscription?.status === 'trial';

  const handleCheckout = async () => {
    if (!selectedPriceId) {
      toast.error("Selecione um plano");
      return;
    }
    if (!user) {
      toast.error("Você precisa estar logado");
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId: selectedPriceId, billingMonths },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao iniciar checkout";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao abrir portal";
      toast.error(msg);
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {isGrandfathered && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="pt-6 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Conta vitalícia (grandfathered)</p>
              <p className="text-sm text-muted-foreground">Você tem acesso ilimitado sem necessidade de assinatura.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {isTrial && !isGrandfathered && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="pt-6 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Período de teste grátis</p>
                <p className="text-sm text-muted-foreground">
                  {trialDaysLeft > 0
                    ? <>Faltam <strong>{trialDaysLeft}</strong> {trialDaysLeft === 1 ? 'dia' : 'dias'} para o fim do trial. Escolha um plano para continuar sem interrupção.</>
                    : <>Seu período de teste terminou. Assine para continuar usando o sistema.</>}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isActive && !isGrandfathered && (
        <Card className="border-green-500/40 bg-green-500/5">
          <CardContent className="pt-6 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Check className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium">Assinatura ativa</p>
                <p className="text-sm text-muted-foreground">
                  {subscription?.seat_limit} usuário(s) · Próximo ciclo em {' '}
                  {subscription?.current_period_end
                    ? new Date(subscription.current_period_end).toLocaleDateString('pt-BR')
                    : '—'}
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={handlePortal} disabled={portalLoading}>
              {portalLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Settings2 className="h-4 w-4 mr-2" />}
              Gerenciar assinatura
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="text-center">
        <h2 className="text-2xl font-bold mb-1">Escolha seu plano</h2>
        <p className="text-muted-foreground text-sm">
          Cobrança recorrente automática: escolha mensal, trimestral, semestral ou anual.
          Períodos mais longos têm desconto. Cobrado no cartão a cada ciclo.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {BILLING_PERIODS.map((p) => {
          const active = billingMonths === p.months;
          return (
            <button
              key={p.months}
              type="button"
              onClick={() => setBillingMonths(p.months)}
              className={`px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                active
                  ? 'bg-primary text-primary-foreground border-primary shadow'
                  : 'bg-background border-border hover:border-primary/40'
              }`}
            >
              {p.label}
              {p.badge && (
                <span className={`ml-2 text-xs ${active ? 'opacity-90' : 'text-primary'}`}>{p.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = currentPriceId === plan.priceId;
          const isSelected = selectedPriceId === plan.priceId;
          const isMonthly = billingMonths === 1;
          const totalCycle = periodTotal(plan.priceBRL, billingMonths);
          const effectiveMonthly = totalCycle / billingMonths;
          return (
            <Card
              key={plan.priceId}
              className={`cursor-pointer transition-all hover:shadow-lg ${
                isSelected ? 'ring-2 ring-primary shadow-lg' : ''
              } ${isCurrent ? 'border-green-500/60' : ''}`}
              onClick={() => setSelectedPriceId(plan.priceId)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {isCurrent && <Badge className="bg-green-500/15 text-green-700 hover:bg-green-500/15">Atual</Badge>}
                  {isSelected && !isCurrent && (
                    <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
                <CardDescription className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {plan.seats} {plan.seats === 1 ? 'usuário' : 'usuários'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-2xl font-bold">{formatBRL(effectiveMonthly)}</span>
                    <span className="text-sm text-muted-foreground">/mês</span>
                    {!isMonthly && (
                      <span className="text-xs text-muted-foreground line-through">
                        {formatBRL(plan.priceBRL)}
                      </span>
                    )}
                  </div>
                  {!isMonthly ? (
                    <div className="text-xs text-muted-foreground">
                      {formatBRL(totalCycle)} a cada {billingMonths} meses (renovação automática)
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {formatBRL(plan.priceBRL / plan.seats)} por usuário/mês
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedPriceId && (
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(() => {
              const plan = PLANS.find(p => p.priceId === selectedPriceId)!;
              const period = BILLING_PERIODS.find(b => b.months === billingMonths)!;
              const total = periodTotal(plan.priceBRL, billingMonths);
              const fullPrice = plan.priceBRL * billingMonths;
              const saved = fullPrice - total;
              const isMonthly = billingMonths === 1;
              return (
                <>
                  <div className="flex justify-between"><span>Plano</span><span className="font-medium">{plan.name}</span></div>
                  <div className="flex justify-between"><span>Usuários</span><span className="font-medium">{plan.seats}</span></div>
                  <div className="flex justify-between"><span>Período</span><span className="font-medium">{period.label}{period.badge ? ` ${period.badge}` : ''}</span></div>
                  {!isMonthly && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Sem desconto</span>
                      <span className="line-through">{formatBRL(fullPrice)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold border-t pt-3">
                    <span>{isMonthly ? 'Total mensal' : `Total a cada ${billingMonths} meses`}</span>
                    <span>{formatBRL(total)}</span>
                  </div>
                  {!isMonthly && saved > 0 && (
                    <div className="text-xs text-emerald-600 text-right">
                      Você economiza {formatBRL(saved)} por ciclo
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground text-center border-t pt-2">
                    Renovação automática a cada {billingMonths === 1 ? 'mês' : `${billingMonths} meses`}.
                    Cancele a qualquer momento em "Gerenciar assinatura".
                  </div>
                </>
              );
            })()}
            <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground border-t pt-3">
              <span className="flex items-center gap-1">
                <CreditCard className="h-3.5 w-3.5" />
                Cartão (cobrança recorrente)
              </span>
            </div>
            <Button className="w-full" size="lg" onClick={handleCheckout} disabled={isLoading}>
              {isLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processando...</>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  {isActive
                    ? 'Trocar de plano'
                    : billingMonths === 1
                      ? 'Assinar agora'
                      : `Assinar (a cada ${billingMonths} meses)`}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
