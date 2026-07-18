/**
 * Rota pública TEMPORÁRIA usada apenas para regressão visual do componente
 * de planos em diferentes larguras de tela. Não linkada em nenhum menu.
 * Renderiza uma versão "estática" do preview (dados mockados) para permitir
 * screenshots via Playwright sem exigir autenticação.
 */
import { BrandMark } from "@/components/brand/BrandMark";
import { PLANS, formatBRL, BILLING_PERIODS, periodTotal } from "@/lib/plans";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Users,
  Check,
  Star,
  TrendingDown,
  CreditCard,
  ShieldCheck,
  Activity,
  LogOut,
} from "lucide-react";
import { useMemo, useState } from "react";

const CYCLE_META: Record<number, { short: string; long: string; per: string }> = {
  1: { short: "Mensal", long: "por mês", per: "mês" },
  6: { short: "Semestral", long: "a cada 6 meses", per: "semestre" },
  12: { short: "Anual", long: "por ano", per: "ano" },
};

export default function PricingPreview() {
  const [priceId, setPriceId] = useState(PLANS[0].priceId);
  const [months, setMonths] = useState(12);
  const plan = useMemo(
    () => PLANS.find((p) => p.priceId === priceId) ?? PLANS[0],
    [priceId],
  );
  const recommended = 12;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BrandMark className="h-8 w-8 shrink-0" />
            <span className="font-semibold tracking-tight truncate">Hora Pro</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="px-2 sm:px-3">
              <Activity className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Ver status</span>
            </Button>
            <Button variant="ghost" size="sm" className="px-2 sm:px-3">
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-8 md:py-14 space-y-10">
        <section className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 sm:px-4 py-1.5 text-[11px] sm:text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Sua clínica, no controle total
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight break-words">
            Escolha o plano ideal e{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              libere seu acesso
            </span>
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground">
            Assinatura por usuário, sem fidelidade. Após a confirmação do pagamento,
            sua agenda é liberada em tempo real.
          </p>
        </section>

        <Card className="border-border/60">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                1
              </span>
              Quantos usuários vão acessar?
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Select value={priceId} onValueChange={setPriceId}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p.priceId} value={p.priceId}>
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
                  {formatBRL(plan.priceBRL / plan.seats)}
                </span>{" "}
                por usuário/mês.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
              2
            </span>
            Escolha o ciclo de cobrança
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {BILLING_PERIODS.map((p) => {
              const meta = CYCLE_META[p.months];
              const totalCycle = periodTotal(plan.priceBRL, p.months);
              const effMonthly = totalCycle / p.months;
              const fullPrice = plan.priceBRL * p.months;
              const saved = fullPrice - totalCycle;
              const isMonthly = p.months === 1;
              const selected = months === p.months;
              const isRec = p.months === recommended;
              return (
                <button
                  key={p.months}
                  type="button"
                  onClick={() => setMonths(p.months)}
                  className={[
                    "relative w-full text-left rounded-2xl border p-4 sm:p-5 transition-all",
                    "hover:shadow-md hover:border-primary/50",
                    selected
                      ? "border-primary bg-primary/5 shadow-lg ring-2 ring-primary"
                      : "border-border bg-card",
                    isRec && !selected ? "border-primary/40" : "",
                  ].join(" ")}
                >
                  {isRec && (
                    <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm bg-primary text-primary-foreground">
                      <Star className="h-3 w-3 fill-current" />
                      Recomendado
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{meta.short}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Cobrado {meta.long}
                      </p>
                    </div>
                    <div
                      className={[
                        "h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center",
                        selected
                          ? "border-primary bg-primary"
                          : "border-muted-foreground/30",
                      ].join(" ")}
                    >
                      {selected && (
                        <Check className="h-3 w-3 text-primary-foreground" />
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-baseline gap-1 flex-wrap">
                      <span className="text-3xl font-bold tabular-nums leading-none">
                        {formatBRL(effMonthly)}
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
                          <div className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600">
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
                </button>
              );
            })}
          </div>
        </div>

        <Card className="border-primary/30 bg-gradient-to-br from-card to-primary/5">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                3
              </span>
              Confirme e ative
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex flex-col rounded-lg border border-border/60 p-2.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Usuários
                </span>
                <span className="font-semibold text-sm">{plan.seats}</span>
              </div>
              <div className="flex flex-col rounded-lg border border-border/60 p-2.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Ciclo
                </span>
                <span className="font-semibold text-sm">
                  {CYCLE_META[months].short}
                </span>
              </div>
              <div className="flex flex-col rounded-lg border border-primary/40 bg-primary/5 p-2.5 col-span-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Total por {CYCLE_META[months].per}
                </span>
                <span className="font-semibold text-lg tabular-nums">
                  {formatBRL(periodTotal(plan.priceBRL, months))}
                </span>
              </div>
            </div>
            <Button className="w-full" size="lg">
              <CreditCard className="mr-2 h-4 w-4" />
              Assinar ({CYCLE_META[months].short.toLowerCase()})
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
