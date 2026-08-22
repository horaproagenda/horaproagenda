import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Log técnico (não exibido ao usuário) para rastrear links quebrados.
    console.warn("[404] Rota inexistente acessada:", location.pathname);
  }, [location.pathname]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4 pt-safe pb-safe">
      <Helmet>
        <title>Página não encontrada — Hora Pro</title>
        <meta
          name="description"
          content="A página que você tentou abrir não existe ou foi movida. Volte para o início do Hora Pro."
        />
        <meta name="robots" content="noindex,follow" />
      </Helmet>
      <div className="w-full max-w-md text-center">
        <p className="mb-2 text-5xl font-bold text-muted-foreground">404</p>
        <h1 className="mb-2 text-2xl font-semibold text-foreground">
          Página não encontrada
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          O endereço <span className="font-medium break-all">{location.pathname}</span> não
          existe ou foi movido. Verifique o link ou volte para uma página válida.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="outline" className="min-h-11" onClick={() => navigate(-1)}>
            Voltar
          </Button>
          <Button asChild className="min-h-11">
            <Link to="/">Ir para o início</Link>
          </Button>
        </div>
      </div>
    </main>
  );
};

export default NotFound;
