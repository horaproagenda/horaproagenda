import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useAccountSubscription } from "@/hooks/useAccountSubscription";
import { PLANS, formatBRL } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, Users, CreditCard, Loader2, Settings2, Sparkles } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";

export default function Assinatura() {
  const { user } = useAuth();
  const { subscription, trialDaysLeft } = useAccountSubscription();
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
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
        body: { priceId: selectedPriceId },
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
    <AppLayout title="Assinatura" subtitle="Escolha o plano ideal para sua equipe">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Status atual */}
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
          <h2 className="text-2xl font-bold mb-1">Planos mensais</h2>
          <p className="text-muted-foreground text-sm">Cobrança recorrente em BRL. Cancele quando quiser pelo portal.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = currentPriceId === plan.priceId;
            const isSelected = selectedPriceId === plan.priceId;
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
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">{formatBRL(plan.priceBRL)}</span>
                      <span className="text-sm text-muted-foreground">/mês</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatBRL(plan.priceBRL / plan.seats)} por usuário/mês
                    </div>
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
                return (
                  <>
                    <div className="flex justify-between"><span>Plano</span><span className="font-medium">{plan.name}</span></div>
                    <div className="flex justify-between"><span>Usuários</span><span className="font-medium">{plan.seats}</span></div>
                    <div className="flex justify-between text-lg font-bold border-t pt-3">
                      <span>Total mensal</span>
                      <span>{formatBRL(plan.priceBRL)}</span>
                    </div>
                  </>
                );
              })()}
              <p className="text-xs text-muted-foreground text-center">
                Cartão de Crédito ou Boleto · Cobrança recorrente mensal
              </p>
              <Button className="w-full" size="lg" onClick={handleCheckout} disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processando...</>
                ) : (
                  <><CreditCard className="mr-2 h-4 w-4" />{isActive ? 'Trocar de plano' : 'Assinar agora'}</>
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
