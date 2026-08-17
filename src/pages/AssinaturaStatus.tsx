import { useState } from "react";
import { Navigate, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAccountSubscription } from "@/hooks/useAccountSubscription";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandMark } from "@/components/brand/BrandMark";
import { toast } from "sonner";
import { goToStripe } from "@/lib/stripeCheckout";
import {
  CheckCircle2, AlertCircle, XCircle, Clock, Sparkles, FileText,
  RefreshCw, CreditCard, ArrowLeft, LogOut, Calendar, Users, Loader2,
} from "lucide-react";

type StatusVisual = {
  label: string;
  variant: "success" | "warning" | "danger" | "info";
  icon: typeof CheckCircle2;
  description: string;
};

const STATUS_MAP: Record<string, StatusVisual> = {
  active:        { label: "Ativa",        variant: "success", icon: CheckCircle2, description: "Sua assinatura está em dia. Aproveite todos os recursos do Hora Pro." },
  grandfathered: { label: "Vitalícia",    variant: "success", icon: Sparkles,     description: "Você tem acesso ilimitado, sem cobrança recorrente." },
  trial:         { label: "Pendente",     variant: "warning", icon: Clock,        description: "Assinatura pendente. Escolha um plano para liberar o acesso." },
  past_due:      { label: "Em atraso",    variant: "warning", icon: AlertCircle,  description: "O pagamento da última fatura falhou. Atualize seu método de pagamento." },
  canceled:      { label: "Cancelada",    variant: "danger",  icon: XCircle,      description: "Sua assinatura foi cancelada. Assine novamente para retomar o acesso." },
};

const VARIANT_CLASSES: Record<StatusVisual["variant"], string> = {
  success: "bg-primary/10 text-primary border-primary/30",
  warning: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  danger:  "bg-destructive/10 text-destructive border-destructive/30",
  info:    "bg-muted text-foreground border-border",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function AssinaturaStatus() {
  const { hasRole, signOut } = useAuth();
  const { subscription, isLoading, hasAccess, isTrialing, trialDaysLeft } = useAccountSubscription();
  const navigate = useNavigate();
  const [portalLoading, setPortalLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (!hasRole("admin")) return <Navigate to="/agenda" replace />;

  const statusKey = subscription?.status ?? "trial";
  const visual = isTrialing
    ? {
        label: "Teste gratuito",
        variant: "success" as const,
        icon: Sparkles,
        description: `Você tem ${trialDaysLeft} dia(s) de teste. Ao final, o cartão salvo é cobrado automaticamente.`,
      }
    : STATUS_MAP[statusKey] ?? STATUS_MAP.trial;
  const StatusIcon = visual.icon;

  const expiresAt = subscription?.current_period_end ?? subscription?.trial_ends_at ?? null;
  const daysLeft = daysUntil(expiresAt);
  const isActiveOrGrand = statusKey === "active" || statusKey === "grandfathered" || isTrialing;
  const isCancelable = statusKey === "active" || statusKey === "past_due" || isTrialing;
  const hasStripeCustomer = !!subscription?.stripe_customer_id;

  async function openPortal() {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) goToStripe(data.url);
      else throw new Error("Portal indisponível");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao abrir portal";
      toast.error(msg);
    } finally {
      setPortalLoading(false);
    }
  }

  async function refreshStatus() {
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      toast.success("Status atualizado");
      // O realtime do hook reinvalida a query automaticamente.
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao atualizar";
      toast.error(msg);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandMark className="h-8 w-8" />
            <span className="font-semibold tracking-tight">Hora Pro</span>
          </div>
          <div className="flex items-center gap-1">
            {hasAccess && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/agenda")}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar à agenda
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 md:py-12 space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Status da assinatura</h1>
          <p className="text-muted-foreground text-sm">
            Acompanhe em tempo real a situação do seu plano, próxima cobrança e histórico de faturas.
          </p>
        </div>

        {/* Card principal */}
        <Card className={`border-2 ${VARIANT_CLASSES[visual.variant]}`}>
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className={`h-12 w-12 rounded-full flex items-center justify-center ${VARIANT_CLASSES[visual.variant]}`}>
                  <StatusIcon className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-2xl">{visual.label}</CardTitle>
                    <Badge variant="outline" className={VARIANT_CLASSES[visual.variant]}>
                      {statusKey}
                    </Badge>
                  </div>
                  <CardDescription className="mt-1 text-sm">{visual.description}</CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={refreshStatus} disabled={refreshing || isLoading}>
                {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Atualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t">
              <InfoTile
                icon={Calendar}
                label={isActiveOrGrand ? "Próxima renovação" : "Expira em"}
                value={statusKey === "grandfathered" ? "Sem expiração" : formatDate(expiresAt)}
                hint={daysLeft !== null && statusKey !== "grandfathered"
                  ? daysLeft > 0
                    ? `em ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"}`
                    : daysLeft === 0 ? "hoje" : `há ${Math.abs(daysLeft)} dias`
                  : undefined}
              />
              <InfoTile
                icon={Users}
                label="Usuários contratados"
                value={subscription?.seat_limit ? `${subscription.seat_limit}` : "—"}
              />
              <InfoTile
                icon={CreditCard}
                label="Ciclo"
                value={subscription?.stripe_price_id ? "Assinatura Stripe" : "—"}
              />
            </div>
          </CardContent>
        </Card>

        {/* Ações */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Faturas e recibos
              </CardTitle>
              <CardDescription>
                Baixe faturas, veja o histórico de cobranças e atualize seu cartão no portal seguro da Stripe.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={openPortal} disabled={portalLoading || !hasStripeCustomer}>
                {portalLoading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Abrindo...</>
                ) : (
                  <><FileText className="h-4 w-4 mr-2" /> Ver faturas e recibos</>
                )}
              </Button>
              {!hasStripeCustomer && (
                <p className="text-xs text-muted-foreground mt-2">
                  Disponível após a primeira cobrança aprovada.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                {isActiveOrGrand ? "Gerenciar plano" : "Ativar assinatura"}
              </CardTitle>
              <CardDescription>
                {isActiveOrGrand
                  ? isCancelable
                    ? "Troque de plano, altere a quantidade de usuários ou cancele."
                    : "Sua assinatura vitalícia não requer gerenciamento."
                  : "Escolha um plano para liberar o acesso completo ao sistema."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant={isActiveOrGrand ? "outline" : "default"} className="w-full" asChild>
                <Link to="/assinatura">
                  {isActiveOrGrand ? "Alterar plano" : "Escolher plano"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Aviso */}
        {!isActiveOrGrand && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Acesso restrito</p>
                <p className="text-muted-foreground mt-0.5">
                  As áreas operacionais (agenda, clientes, financeiro) só são liberadas quando o status
                  ficar <strong>ativo</strong>. A liberação é automática assim que confirmamos o pagamento.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function InfoTile({
  icon: Icon, label, value, hint,
}: { icon: typeof Calendar; label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-base font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
