import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { consumeCheckoutReturnPath, notifySubscriptionUpdated } from "@/lib/stripeCheckout";

export default function AssinaturaSucesso() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const qc = useQueryClient();
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  // Rota de origem (memorizada antes de ir ao Stripe) — resolvida uma única vez.
  const [returnPath] = useState(() => consumeCheckoutReturnPath("/"));

  // Após retorno do Stripe, força check-subscription (não depende do webhook)
  // e faz polling curto até que account_subscriptions.status = 'active'.
  useEffect(() => {
    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      let ok = false;
      try {
        // dispara sincronização com o Stripe
        try {
          await supabase.functions.invoke("check-subscription");
        } catch (e) {
          console.warn("[AssinaturaSucesso] check-subscription falhou:", e);
        }

        // polling até 20s
        const deadline = Date.now() + 20_000;
        while (!cancelled && Date.now() < deadline) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any).rpc("get_my_subscription");
          const sub = data && (data.id ? data : Array.isArray(data) ? data[0] : null);
          if (sub && (sub.status === "active" || sub.status === "grandfathered" || sub.is_grandfathered)) {
            ok = true;
            if (!cancelled) setConfirmed(true);
            break;
          }
          await new Promise((r) => setTimeout(r, 1500));
          // segunda tentativa de sync a cada iteração
          try { await supabase.functions.invoke("check-subscription"); } catch { /* noop */ }
        }
      } finally {
        if (!cancelled) {
          setConfirming(false);
          // invalida caches de assinatura/assentos
          if (user?.id) {
            qc.invalidateQueries({ queryKey: ["account-subscription", user.id] });
            qc.invalidateQueries({ queryKey: ["seat-usage", user.id] });
          }
          // avisa outras abas do app que o acesso mudou
          notifySubscriptionUpdated();
          // volta automaticamente para onde o usuário estava antes do checkout
          if (ok) {
            redirectTimer = setTimeout(() => {
              navigate(returnPath, { replace: true });
            }, 1800);
          }
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [sessionId, user?.id, qc, navigate, returnPath]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            {confirming ? (
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
            ) : (
              <CheckCircle2 className="h-10 w-10 text-primary" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {confirming ? "Confirmando pagamento..." : "Pagamento Confirmado!"}
          </CardTitle>
          <CardDescription>
            {confirming
              ? "Aguarde enquanto ativamos sua conta."
              : confirmed
                ? "Sua assinatura foi ativada com sucesso. Levando você de volta ao aplicativo..."
                : "Recebemos o pagamento. A ativação pode levar alguns instantes."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Obrigado por assinar! Você já tem acesso completo ao sistema.
          </p>
          <Button
            onClick={() => navigate(returnPath, { replace: true })}
            className="w-full"
            disabled={confirming}
          >
            Voltar ao aplicativo
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
