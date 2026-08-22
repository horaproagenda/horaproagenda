import { Link } from "react-router-dom";
import { ArrowLeft, Mail, MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Helmet } from "react-helmet-async";
import { BRAND } from "@/content/brand";

export default function Contato() {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Contato — Hora Pro</title>
        <meta
          name="description"
          content={`Fale com a equipe Hora Pro. E-mail de contato: ${BRAND.supportEmail}.`}
        />
        <link rel="canonical" href={`${BRAND.url}/contato`} />
        <meta property="og:title" content="Contato — Hora Pro" />
        <meta property="og:description" content={`E-mail de contato: ${BRAND.supportEmail}`} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`${BRAND.url}/contato`} />
        <meta name="twitter:card" content="summary" />
      </Helmet>

      <main className="max-w-2xl mx-auto px-4 py-12">
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para o início
          </Link>
        </div>

        <Card>
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" aria-hidden="true" />
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Fale com a gente
              </span>
            </div>
            <h1 className="text-2xl font-display font-semibold leading-none tracking-tight">Contato</h1>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              Precisa de ajuda, quer tirar dúvidas sobre planos ou reportar um problema? Nossa
              equipe responde por e-mail em horário comercial (seg. a sex., 9h às 18h).
            </p>
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/40 p-4">
              <Mail className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
              <div>
                <p className="font-medium text-foreground">E-mail de contato</p>
                <a
                  href={`mailto:${BRAND.supportEmail}`}
                  className="text-primary hover:underline break-all"
                >
                  {BRAND.supportEmail}
                </a>
              </div>
            </div>
            <p>
              {BRAND.name} — {BRAND.url.replace("https://", "")}
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
