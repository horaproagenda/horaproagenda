import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CashRegisterClosedAlertProps {
  message?: string;
}

export function CashRegisterClosedAlert({ message }: CashRegisterClosedAlertProps) {
  const navigate = useNavigate();

  return (
    <Alert variant="destructive" className="mb-4">
      <Lock className="h-4 w-4" />
      <AlertTitle>Caixa Fechado</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>{message || 'Abra o caixa para realizar transações financeiras.'}</span>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => navigate('/caixa?tab=caixa')}
          className="shrink-0"
        >
          Abrir Caixa
        </Button>
      </AlertDescription>
    </Alert>
  );
}
