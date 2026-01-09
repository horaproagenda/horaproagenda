import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Mail, Calendar, ChevronRight, Edit, Trash2, MoreVertical } from 'lucide-react';
import { Client } from '@/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useClients } from '@/hooks/useClients';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
  const navigate = useNavigate();
  const { deleteClient } = useClients();
  const { hasRole } = useAuth();
  const canDelete = hasRole('admin');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteClient.mutateAsync(client.id);
    setShowDeleteDialog(false);
  };

  return (
    <>
      <div 
        className="group rounded-lg border border-border bg-card p-3 transition-all duration-300 hover:border-primary/20 hover:shadow-md cursor-pointer"
        onClick={() => navigate(`/clientes/${client.id}`)}
      >
        {/* Header with Avatar and Actions */}
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9 border border-primary/10 transition-transform duration-200 group-hover:scale-105">
            <AvatarFallback className="bg-primary/5 text-primary text-xs font-medium">
              {getInitials(client.name)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-medium text-sm text-foreground truncate leading-tight">
                  {client.name}
                </h4>
                <Badge 
                  variant={client.is_active ? "default" : "secondary"} 
                  className="mt-0.5 text-[9px] px-1.5 py-0 h-4"
                >
                  {client.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/clientes/${client.id}`);
                    }}
                    className="text-xs"
                  >
                    <Edit className="h-3.5 w-3.5 mr-2" />
                    Editar
                  </DropdownMenuItem>
                  {canDelete && (
                    <DropdownMenuItem
                      className="text-xs text-destructive focus:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeleteDialog(true);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Excluir
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="mt-2 space-y-0.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{client.phone}</span>
          </p>
          {client.email && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{client.email}</span>
            </p>
          )}
        </div>

        {/* Notes */}
        {client.notes && (
          <p className="mt-2 text-[10px] text-muted-foreground/80 border-l border-primary/20 pl-2 italic line-clamp-2">
            {client.notes}
          </p>
        )}

        {/* Footer */}
        <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            Desde {format(new Date(client.created_at), "MMM/yy", { locale: ptBR })}
          </span>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onSchedule?.(client);
              }}
              className="h-6 px-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            >
              <Calendar className="h-3 w-3 mr-1" />
              Agendar
            </Button>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Excluir Cliente</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              Tem certeza que deseja excluir "{client.name}"? 
              Esta ação removerá documentos, fotos e orçamentos.
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
    </>
  );
}
