import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldOff } from 'lucide-react';

export default function ContaInativa() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <ShieldOff className="h-6 w-6 text-destructive" aria-hidden="true" />
          </div>
          <CardTitle>Acesso suspenso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Seu acesso a esta conta foi desativado pelo administrador.
            Entre em contato com o responsável para reativar.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/auth">Voltar para o login</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
