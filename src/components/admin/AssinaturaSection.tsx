import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useAccountSubscription } from "@/hooks/useAccountSubscription";
import { PLANS, formatBRL, BILLING_PERIODS, periodTotal } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Check,
  Users,
  CreditCard,
  Loader2,
  Settings2,
  Sparkles,
  TrendingDown,
  Star,
  ShieldCheck,
} from "lucide-react";

/** Rótulo curto por ciclo — usado em várias telas. */
const CYCLE_META: Record<number, { short: string; long: string; per: string }> = {
  1: { short: "Mensal", long: "por mês", per: "mês" },
  6: { short: "Semestral", long: "a cada 6 meses", per: "semestre" },
  12: { short: "Anual", long: "por ano", per: "ano" },
};

export function AssinaturaSection() {
  const { user } = useAuth();
  const { subscription } = useAccountSubscription();

  // Ciclo padrão: o de maior economia (anual).
  const [billingMonths, setBillingMonths] = useState<number>(12);
  // Plano padrão: 1 usuário. Fica invariante ao trocar ciclo.
  const [selectedSeats, setSelectedSeats] = useState<number>(PLANS[0].seats);

  const [isLoading, setIsLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const currentSeats = subscription?.seat_limit ?? null;
  const isActive = subscription?.status === "active";
  const isGrandfathered = subscription?.is_grandfathered;

  const selectedPlan = useMemo(
    () => PLANS.find((p) => p.seats === selectedSeats) ?? PLANS[0],
    [selectedSeats],
  );

  // Ciclo com maior desconto → base do destaque "Recomendado".
  const recommendedMonths = useMemo(
    () =>
      BILLING_PERIODS.reduce((best, p) => (p.discount > best.discount ? p : best))
        .months,
    [],
  );

  const [isPixLoading, setIsPixLoading] = useState(false);

  const handleCheckout = async () => {
    if (!user) {
      toast.error("Você precisa estar logado");
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { seats: selectedSeats, billingMonths },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao iniciar checkout";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePixCheckout = async () => {
    if (!user) {
      toast.error("Você precisa estar logado");
      return;
    }
    setIsPixLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-pix-checkout", {
        body: { seats: selectedSeats, billingMonths },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao iniciar pagamento Pix";
      toast.error(msg);
    } finally {
      setIsPixLoading(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao abrir portal";
      toast.error(msg);
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {isGrandfathered && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="pt-6 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">Conta vitalícia (grandfathered)</p>
              <p className="text-sm text-muted-foreground">
                Você tem acesso ilimitado sem necessidade de assinatura.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isActive && !isGrandfathered && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Check className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">Assinatura ativa</p>
                <p className="text-sm text-muted-foreground truncate">
                  {subscription?.seat_limit} usuário(s) · Próximo ciclo em{" "}
                  {subscription?.current_period_end
                    ? new Date(subscription.current_period_end).toLocaleDateString(
                        "pt-BR",
                      )
                    : "—"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handlePortal}
              disabled={portalLoading}
              className="w-full sm:w-auto"
            >
              {portalLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Settings2 className="h-4 w-4 mr-2" />
              )}
              Gerenciar assinatura
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Passo 1: quantidade de usuários */}
      <Card className="border-border/60">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
              1
            </span>
            Quantos usuários vão acessar?
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Select
              value={String(selectedSeats)}
              onValueChange={(v) => setSelectedSeats(Number(v))}
            >
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLANS.map((p) => (
                  <SelectItem key={p.seats} value={String(p.seats)}>
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {p.seats} {p.seats === 1 ? "usuário" : "usuários"}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Base:{" "}
              <span className="font-medium text-foreground">
                {formatBRL(selectedPlan.priceBRL / selectedPlan.seats)}
              </span>{" "}
              por usuário/mês.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Passo 2: comparação lado a lado dos ciclos */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
            2
          </span>
          Escolha o ciclo de cobrança
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {BILLING_PERIODS.map((p) => (
            <CycleCard
              key={p.months}
              months={p.months}
              plan={selectedPlan}
              selected={billingMonths === p.months}
              recommended={p.months === recommendedMonths}
              currentActive={
                isActive &&
                currentSeats === selectedPlan.seats /* mesma quantidade de usuários */
              }
              onSelect={() => setBillingMonths(p.months)}
            />
          ))}
        </div>
      </div>

      {/* Passo 3: resumo + CTA */}
      <SubscriptionSummary
        plan={selectedPlan}
        billingMonths={billingMonths}
        isActive={isActive}
        isLoading={isLoading}
        onCheckout={handleCheckout}
      />
    </div>
  );
}

/* ---------------- Cycle Card ---------------- */

interface CycleCardProps {
  months: number;
  plan: (typeof PLANS)[number];
  selected: boolean;
  recommended: boolean;
  currentActive: boolean;
  onSelect: () => void;
}

function CycleCard({
  months,
  plan,
  selected,
  recommended,
  currentActive,
  onSelect,
}: CycleCardProps) {
  const meta = CYCLE_META[months];
  const totalCycle = periodTotal(plan.priceBRL, months);
  const effectiveMonthly = totalCycle / months;
  const fullPrice = plan.priceBRL * months;
  const saved = fullPrice - totalCycle;
  const isMonthly = months === 1;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "relative w-full text-left rounded-2xl border p-4 sm:p-5 transition-all",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        "hover:shadow-md hover:border-primary/50",
        selected
          ? "border-primary bg-primary/5 shadow-lg ring-2 ring-primary"
          : "border-border bg-card",
        recommended && !selected ? "border-primary/40" : "",
      ].join(" ")}
    >
      {recommended && (
        <span
          className={[
            "absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm",
            selected
              ? "bg-primary text-primary-foreground"
              : "bg-primary/90 text-primary-foreground",
          ].join(" ")}
        >
          <Star className="h-3 w-3 fill-current" />
          Recomendado
        </span>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{meta.short}</p>
          <p className="text-[11px] text-muted-foreground">Cobrado {meta.long}</p>
        </div>
        <div
          className={[
            "h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors",
            selected ? "border-primary bg-primary" : "border-muted-foreground/30",
          ].join(" ")}
        >
          {selected && <Check className="h-3 w-3 text-primary-foreground" />}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className="text-3xl font-bold tabular-nums leading-none">
            {formatBRL(effectiveMonthly)}
          </span>
          <span className="text-xs text-muted-foreground">/mês</span>
        </div>

        {!isMonthly ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-muted-foreground">
              Total:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatBRL(totalCycle)}
              </span>{" "}
              / {meta.per}
            </p>
            {saved > 0 && (
              <div className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <TrendingDown className="h-3 w-3" />
                Economia de {formatBRL(saved)}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Sem compromisso de longo prazo
          </p>
        )}
      </div>

      {currentActive && (
        <Badge className="mt-3 bg-primary/15 text-primary hover:bg-primary/15 border-0">
          Seu plano atual
        </Badge>
      )}
    </button>
  );
}

/* ---------------- Summary + CTA ---------------- */

interface SubscriptionSummaryProps {
  plan: (typeof PLANS)[number];
  billingMonths: number;
  isActive: boolean | undefined;
  isLoading: boolean;
  onCheckout: () => void;
}

function SubscriptionSummary({
  plan,
  billingMonths,
  isActive,
  isLoading,
  onCheckout,
}: SubscriptionSummaryProps) {
  const meta = CYCLE_META[billingMonths];
  const planTotal = periodTotal(plan.priceBRL, billingMonths);
  const fullPrice = plan.priceBRL * billingMonths;
  const saved = fullPrice - planTotal;
  const isMonthly = billingMonths === 1;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-card to-primary/5">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
            3
          </span>
          Confirme e ative
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <SummaryRow label="Usuários" value={String(plan.seats)} />
          <SummaryRow label="Ciclo" value={meta.short} />
          {!isMonthly && (
            <SummaryRow
              label="Sem desconto"
              value={formatBRL(fullPrice)}
              strike
              muted
            />
          )}
          <SummaryRow
            label={isMonthly ? "Total mensal" : `Total por ${meta.per}`}
            value={formatBRL(planTotal)}
            highlight
          />
        </div>

        {!isMonthly && saved > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
            <TrendingDown className="h-4 w-4 shrink-0" />
            <span>
              Você economiza{" "}
              <span className="font-semibold">{formatBRL(saved)}</span> em relação ao
              plano mensal.
            </span>
          </div>
        )}

        <Button
          className="w-full"
          size="lg"
          onClick={onCheckout}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...
            </>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" />
              {isActive
                ? "Trocar de plano"
                : isMonthly
                  ? "Assinar agora"
                  : `Assinar (${meta.short.toLowerCase()})`}
            </>
          )}
        </Button>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> Pagamento seguro Stripe
          </span>
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Cancele quando quiser
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground text-center border-t pt-3">
          Renovação automática {isMonthly ? "todo mês" : `a cada ${billingMonths} meses`}
          . Gerencie tudo pelo portal do cliente.
        </p>
      </CardContent>
    </Card>
  );
}

function SummaryRow({
  label,
  value,
  highlight,
  strike,
  muted,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  strike?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col rounded-lg border p-2.5",
        highlight ? "border-primary/40 bg-primary/5" : "border-border/60",
      ].join(" ")}
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={[
          "font-semibold tabular-nums",
          highlight ? "text-lg" : "text-sm",
          strike ? "line-through" : "",
          muted ? "text-muted-foreground" : "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
