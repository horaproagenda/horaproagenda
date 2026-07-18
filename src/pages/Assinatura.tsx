import { useAuth } from "@/contexts/AuthContext";
import { AssinaturaSection } from "@/components/admin/AssinaturaSection";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navigate, useNavigate } from "react-router-dom";

export default function Assinatura() {
  const { hasRole, signOut } = useAuth();
  const navigate = useNavigate();

  // Somente admin pode gerenciar assinatura.
  if (!hasRole('admin')) {
    return <Navigate to="/agenda" replace />;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Ativar sua assinatura</CardTitle>
            <CardDescription>
              Escolha o plano ideal para sua clínica. Após o pagamento, o acesso é liberado automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>
              Ir para o painel administrativo
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>Sair</Button>
          </CardContent>
        </Card>

        <AssinaturaSection />
      </div>
    </div>
  );
}
