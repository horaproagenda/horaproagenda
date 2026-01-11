import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, Users, CreditCard, Loader2 } from "lucide-react";

// Pricing plans configuration
const PLANS = [
  { id: 'prod_Tm5HqJDUmZsz91', priceId: 'price_1SoX6iDgjrAVrKo6xkSHsjIv', seats: 1, price: 49.90, name: 'Individual' },
  { id: 'prod_Tm5Hq1fvr7du6d', priceId: 'price_1SoX7EDgjrAVrKo6vEqQxuyu', seats: 3, price: 120.00, name: 'Equipe' },
  { id: 'prod_Tm5ZVK0PgVfaAe', priceId: 'price_1SoXO8DgjrAVrKo6u2skhRZ3', seats: 5, price: 220.00, name: 'Negócio' },
  { id: 'prod_Tm5ZZS8wW3u9gI', priceId: 'price_1SoXORDgjrAVrKo6DQDteUl0', seats: 8, price: 369.20, name: 'Profissional' },
  { id: 'prod_Tm5axgFjRbD1FH', priceId: 'price_1SoXOsDgjrAVrKo6xVNGA22c', seats: 10, price: 469.00, name: 'Avançado' },
  { id: 'prod_Tm5aG2Nvd6hKqK', priceId: 'price_1SoXPEDgjrAVrKo619pBxs9u', seats: 12, price: 569.04, name: 'Empresarial' },
  { id: 'prod_Tm5bGNPJxKccy9', priceId: 'price_1SoXQ9DgjrAVrKo6bIDXUdgz', seats: 15, price: 718.50, name: 'Corporativo' },
  { id: 'prod_Tm5bwjw2rdYpkc', priceId: 'price_1SoXQTDgjrAVrKo6kjcicrp7', seats: 20, price: 968.00, name: 'Enterprise' },
];

const BILLING_CYCLES = [
  { id: 'monthly', label: 'Mensal', months: 1, discount: 0 },
  { id: 'quarterly', label: 'Trimestral', months: 3, discount: 10 },
  { id: 'semiannual', label: 'Semestral', months: 6, discount: 12 },
  { id: 'annual', label: 'Anual', months: 12, discount: 15 },
];

export default function Assinatura() {
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [isLoading, setIsLoading] = useState(false);

  const selectedBilling = BILLING_CYCLES.find(b => b.id === billingCycle) || BILLING_CYCLES[0];
  const selectedPlanData = PLANS.find(p => p.priceId === selectedPlan);

  const calculatePrice = (basePrice: number) => {
    const total = basePrice * selectedBilling.months;
    const discount = total * (selectedBilling.discount / 100);
    return {
      total: total - discount,
      original: total,
      discount,
      perMonth: (total - discount) / selectedBilling.months,
    };
  };

  const handleCheckout = async () => {
    if (!selectedPlan) {
      toast.error("Selecione um plano");
      return;
    }

    if (!user) {
      toast.error("Você precisa estar logado para assinar");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          priceId: selectedPlan,
          billingCycle,
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error: unknown) {
      console.error("Checkout error:", error);
      toast.error("Erro ao iniciar checkout. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Escolha seu Plano</h1>
          <p className="text-muted-foreground">
            Selecione o número de acessos e o ciclo de pagamento ideal para você
          </p>
        </div>

        {/* Billing Cycle Selector */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Ciclo de Pagamento</CardTitle>
            <CardDescription>
              Escolha o período de pagamento e economize com descontos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={billingCycle}
              onValueChange={setBillingCycle}
              className="grid grid-cols-2 md:grid-cols-4 gap-4"
            >
              {BILLING_CYCLES.map((cycle) => (
                <div key={cycle.id}>
                  <RadioGroupItem
                    value={cycle.id}
                    id={cycle.id}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={cycle.id}
                    className="flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <span className="font-medium">{cycle.label}</span>
                    {cycle.discount > 0 && (
                      <Badge variant="secondary" className="mt-2 bg-green-100 text-green-800">
                        -{cycle.discount}%
                      </Badge>
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {PLANS.map((plan) => {
            const pricing = calculatePrice(plan.price);
            const isSelected = selectedPlan === plan.priceId;

            return (
              <Card
                key={plan.id}
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  isSelected ? 'ring-2 ring-primary shadow-lg' : ''
                }`}
                onClick={() => setSelectedPlan(plan.priceId)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    {isSelected && (
                      <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                  <CardDescription className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {plan.seats} {plan.seats === 1 ? 'acesso' : 'acessos'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">
                        R$ {pricing.perMonth.toFixed(2).replace('.', ',')}
                      </span>
                      <span className="text-sm text-muted-foreground">/mês</span>
                    </div>
                    
                    {selectedBilling.discount > 0 && (
                      <div className="text-sm">
                        <span className="line-through text-muted-foreground">
                          R$ {pricing.original.toFixed(2).replace('.', ',')}
                        </span>
                        <span className="ml-2 text-green-600 font-medium">
                          R$ {pricing.total.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    )}

                    {selectedBilling.discount === 0 && (
                      <div className="text-sm text-muted-foreground">
                        Total: R$ {pricing.total.toFixed(2).replace('.', ',')}
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                      R$ {(plan.price / plan.seats).toFixed(2).replace('.', ',')} por acesso/mês
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Summary and Checkout */}
        {selectedPlanData && (
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>Resumo do Pedido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span>Plano</span>
                <span className="font-medium">{selectedPlanData.name}</span>
              </div>
              <div className="flex justify-between">
                <span>Acessos</span>
                <span className="font-medium">{selectedPlanData.seats}</span>
              </div>
              <div className="flex justify-between">
                <span>Período</span>
                <span className="font-medium">{selectedBilling.label}</span>
              </div>
              
              {selectedBilling.discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Desconto ({selectedBilling.discount}%)</span>
                  <span className="font-medium">
                    -R$ {calculatePrice(selectedPlanData.price).discount.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              )}

              <div className="border-t pt-4 flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>
                  R$ {calculatePrice(selectedPlanData.price).total.toFixed(2).replace('.', ',')}
                </span>
              </div>

              <div className="text-xs text-muted-foreground text-center">
                Formas de pagamento: Cartão de Crédito, Cartão de Débito, Boleto ou PIX
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleCheckout}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Assinar Agora
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
