import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Client } from '@/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, Mail, Trash2, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useClients } from '@/hooks/useClients';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ClientHeaderProps {
  client: Client;
  onEdit?: () => void;
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

export function ClientHeader({ client, onEdit }: ClientHeaderProps) {
  const navigate = useNavigate();
  const { deleteClient } = useClients();
  const { hasRole } = useAuth();
  const canDelete = hasRole('admin');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = async () => {
    await deleteClient.mutateAsync(client.id);
    navigate('/clientes');
  };

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card/80 backdrop-blur-sm transition-all duration-300">
      {/* Avatar */}
      <Avatar className="h-14 w-14 border-2 border-primary/10">
        <AvatarFallback className="bg-primary/5 text-primary font-semibold text-lg">
          {getInitials(client.name)}
        </AvatarFallback>
      </Avatar>
      
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-semibold text-foreground truncate">{client.name}</h2>
          <Badge variant={client.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 h-4">
            {client.is_active ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {client.phone}
          </span>
          {client.email && (
            <span className="flex items-center gap-1 truncate max-w-[180px]">
              <Mail className="h-3 w-3" />
              {client.email}
            </span>
          )}
          <span className="hidden sm:inline">
            Cliente desde {format(new Date(client.created_at), "MMM/yy", { locale: ptBR })}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5">
        {onEdit && (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onEdit}>
            <Edit className="h-3.5 w-3.5 mr-1" />
            Editar
          </Button>
        )}
        {canDelete && (
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="h-8 text-xs">
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Excluir
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-base">Excluir Cliente</AlertDialogTitle>
                <AlertDialogDescription className="text-sm">
                  Excluir "{client.name}"? Esta ação removerá documentos, fotos e orçamentos.
                  <br /><br />
                  <strong className="text-destructive text-xs">Clientes com agendamentos não podem ser excluídos.</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
