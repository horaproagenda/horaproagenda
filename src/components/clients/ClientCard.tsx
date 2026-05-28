import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, MoreVertical, Edit, Trash2, AlertTriangle } from 'lucide-react';
import { Client } from '@/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useClients } from '@/hooks/useClients';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
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

export function ClientCard({ client }: ClientCardProps) {
  const navigate = useNavigate();
  const { deleteClient, forceDeleteClient } = useClients();
  const { hasRole } = useAuth();
  const canDelete = hasRole('admin');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pendingBalance, setPendingBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!showDeleteDialog) return;
    setPendingBalance(null);
    supabase
      .rpc('get_client_outstanding_balance' as any, { _client_id: client.id })
      .then(({ data }) => setPendingBalance(Number(data) || 0));
  }, [showDeleteDialog, client.id]);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteClient.mutateAsync(client.id);
    setShowDeleteDialog(false);
  };

  const handleForceDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await forceDeleteClient.mutateAsync(client.id);
    setShowDeleteDialog(false);
  };

  return (
    <>
      <div
        className="group flex h-[88px] items-center gap-2 rounded-lg border border-border bg-card p-2.5 transition-all duration-200 hover:border-primary/30 hover:shadow-sm cursor-pointer"
        onClick={() => navigate(`/clientes/${client.id}`)}
      >
        <Avatar className="h-9 w-9 shrink-0 border border-primary/10">
          <AvatarFallback className="bg-primary/5 text-primary text-[11px] font-medium">
            {getInitials(client.name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <h4 className="font-medium text-xs text-foreground truncate leading-tight">
              {client.name}
            </h4>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="h-3 w-3" />
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

          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{client.phone}</span>
          </p>

          <div className="mt-1 flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <Badge
                variant={client.is_active ? "default" : "secondary"}
                className="text-[9px] px-1.5 py-0 h-4"
              >
                {client.is_active ? 'Ativo' : 'Inativo'}
              </Badge>
              {client.registration_source === 'self_link' && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-primary/40 text-primary">
                  Cadastro via link
                </Badge>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground truncate">
              Desde {format(new Date(client.created_at), "MMM/yy", { locale: ptBR })}
            </span>
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
