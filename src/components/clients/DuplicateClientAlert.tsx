import { AlertTriangle, User, Phone, Mail, CheckCircle, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Client } from '@/types';

interface DuplicateClientAlertProps {
  duplicates: Client[];
  matchType: 'name' | 'phone' | 'email';
}

export function DuplicateClientAlert({ duplicates, matchType }: DuplicateClientAlertProps) {
  if (duplicates.length === 0) return null;

  const matchLabels = {
    name: 'nome',
    phone: 'telefone',
    email: 'email'
  };

  return (
    <Alert variant="destructive" className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-800 dark:text-amber-400">
        Possível duplicata encontrada por {matchLabels[matchType]}!
      </AlertTitle>
      <AlertDescription className="mt-2">
        <div className="space-y-2">
          {duplicates.map((client) => (
            <div 
              key={client.id} 
              className="flex items-center justify-between p-2 rounded-md bg-background/80 border"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium text-foreground">{client.name}</span>
                  <Badge 
                    variant="outline" 
                    className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400"
                  >
                    <CheckCircle className="h-3 w-3 mr-1" /> Cadastrado
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {client.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {client.phone}
                    </span>
                  )}
                  {client.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {client.email}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-500">
          Verifique se este cliente já está cadastrado antes de prosseguir.
        </p>
      </AlertDescription>
    </Alert>
  );
}
