import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { consumeCheckoutReturnPath, notifySubscriptionUpdated } from "@/lib/stripeCheckout";
import { waitForSubscriptionAccess, type SyncedSubscription } from "@/lib/subscriptionSync";

export default function AssinaturaSucesso() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const qc = useQueryClient();
  const { user } = useAuth();
  const [confirming, setConfirming] = useState(true);
  const [granted, setGranted] = useState<SyncedSubscription | null>(null);
  // Rota de origem (memorizada antes de ir ao Stripe) — resolvida uma única vez.
  const [returnPath] = useState(() => consumeCheckoutReturnPath("/agenda"));

  // Após o retorno do Stripe, sincroniza direto com o Stripe (não depende do
  // webhook) até que a conta libere o acesso — vale tanto para assinatura paga
  // quanto para o cadastro com cartão salvo (teste gratuito de 30 dias).
  useEffect(() => {
    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const sub = await waitForSubscriptionAccess({
        timeoutMs: 30_000,
        isCancelled: () => cancelled,
      });
      if (cancelled) return;
      setGranted(sub);
      setConfirming(false);
      if (user?.id) {
        qc.invalidateQueries({ queryKey: ["account-subscription", user.id] });
        qc.invalidateQueries({ queryKey: ["seat-usage", user.id] });
      }
      // avisa outras abas do app que o acesso mudou
      notifySubscriptionUpdated();
      if (sub) {
        redirectTimer = setTimeout(() => {
          navigate(returnPath, { replace: true });
        }, 1200);
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [sessionId, user?.id, qc, navigate, returnPath]);

  const isTrial = granted?.status === "trial";

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
            {confirming
              ? "Confirmando pagamento..."
              : isTrial
                ? "Cartão salvo com sucesso!"
                : granted
                  ? "Pagamento confirmado!"
                  : "Pagamento recebido"}
          </CardTitle>
          <CardDescription>
            {confirming
              ? "Aguarde enquanto liberamos seu acesso."
              : isTrial
                ? "Seu teste gratuito de 30 dias começou. Abrindo o aplicativo..."
                : granted
                  ? "Sua assinatura foi ativada. Abrindo o aplicativo..."
                  : "A confirmação pode levar alguns instantes. Você pode entrar no aplicativo e tentar novamente em seguida."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => navigate(returnPath, { replace: true })}
            className="w-full"
            disabled={confirming}
          >
            {granted ? "Entrar no aplicativo" : "Voltar ao aplicativo"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

        </CardContent>
      </Card>
    </div>
  );
}
