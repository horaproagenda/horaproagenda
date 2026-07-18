import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface AccessDeniedProps {
  message?: string;
  requiredRole?: string;
}

export function AccessDenied({
  message = 'Você não tem permissão para acessar esta área.',
  requiredRole,
}: AccessDeniedProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="max-w-md w-full" role="alert" aria-labelledby="access-denied-title">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="h-6 w-6 text-destructive" aria-hidden="true" />
          </div>
          <CardTitle id="access-denied-title">Acesso negado</CardTitle>
          <CardDescription>
            {message}
            {requiredRole && (
              <span className="block mt-2 text-xs text-muted-foreground">
                Perfil necessário: <strong>{requiredRole}</strong>
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild variant="default" className="w-full">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar para o Dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default AccessDenied;
