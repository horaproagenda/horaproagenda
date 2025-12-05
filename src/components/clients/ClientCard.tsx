import { Phone, Mail, Calendar } from 'lucide-react';
import { Client } from '@/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClientCardProps {
  client: Client;
  onSchedule?: (client: Client) => void;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ClientCard({ client, onSchedule }: ClientCardProps) {
  return (
    <div className="group rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:border-primary/30 hover:shadow-lg animate-fade-in">
      <div className="flex items-start gap-4">
        <Avatar className="h-12 w-12 border-2 border-primary/20">
          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
            {getInitials(client.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-foreground truncate">{client.name}</h4>
          <div className="mt-2 space-y-1">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              {client.phone}
            </p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground truncate">
              <Mail className="h-3.5 w-3.5" />
              {client.email}
            </p>
          </div>
        </div>
      </div>

      {client.notes && (
        <p className="mt-3 text-xs text-muted-foreground border-l-2 border-primary/30 pl-2 italic">
          {client.notes}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Cliente desde {format(client.createdAt, "MMM 'de' yyyy", { locale: ptBR })}
        </span>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => onSchedule?.(client)}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Calendar className="h-4 w-4 mr-1" />
          Agendar
        </Button>
      </div>
    </div>
  );
}
