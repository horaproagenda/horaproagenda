import { Client } from '@/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Phone, Mail, Calendar, CreditCard, User } from 'lucide-react';
import { format, differenceInYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClientHeaderProps {
  client: Client;
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

function formatCPF(cpf: string | null) {
  if (!cpf) return '-';
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length !== 11) return cpf;
  return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function calculateAge(birthdate: string | null): number | null {
  if (!birthdate) return null;
  return differenceInYears(new Date(), new Date(birthdate));
}

export function ClientHeader({ client }: ClientHeaderProps) {
  const age = calculateAge(client.birthdate);

  return (
    <Card className="border-l-4 border-l-primary">
      <CardContent className="pt-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <Avatar className="h-24 w-24 border-4 border-primary/20 shadow-lg">
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-3xl">
              {getInitials(client.name)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-3xl font-bold text-foreground">{client.name}</h2>
              <p className="text-sm text-muted-foreground">
                Cliente desde {format(new Date(client.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="p-2 bg-primary/10 rounded-full">
                  <Phone className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Celular</p>
                  <p className="font-medium text-foreground">{client.phone}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="p-2 bg-primary/10 rounded-full">
                  <Calendar className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Data de Nascimento</p>
                  <p className="font-medium text-foreground">
                    {client.birthdate 
                      ? `${format(new Date(client.birthdate), 'dd/MM/yyyy')} (${age} anos)`
                      : '-'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="p-2 bg-primary/10 rounded-full">
                  <CreditCard className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CPF</p>
                  <p className="font-medium text-foreground">{formatCPF(client.cpf)}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="p-2 bg-primary/10 rounded-full">
                  <Mail className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium text-foreground truncate max-w-[180px]">
                    {client.email || '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
