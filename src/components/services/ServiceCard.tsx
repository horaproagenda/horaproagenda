import { useState } from 'react';
import { Clock, DollarSign, MoreVertical, Pencil, Trash2, Sparkles } from 'lucide-react';
import { Service } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getCategoryColor } from '@/lib/categoryColors';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ServiceCardProps {
  service: Service;
  onEdit?: (service: Service) => void;
  onDelete?: () => void;
}

export function ServiceCard({ service, onEdit, onDelete }: ServiceCardProps) {
  const categoryColor = getCategoryColor(service.category);
  const { hasRole } = useAuth();
  const canDelete = hasRole('admin');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', service.id);

      if (error) {
        if (error.message?.includes('violates foreign key constraint')) {
          toast.error('Não é possível excluir: serviço possui agendamentos vinculados.');
        } else {
          throw error;
        }
        return;
      }

      toast.success('Serviço excluído com sucesso!');
      onDelete?.();
    } catch (error: any) {
      toast.error('Erro ao excluir serviço: ' + error.message);
    }
    setShowDeleteDialog(false);
  };

  return (
    <>
      <Card
        className="group flex h-full flex-col p-4 transition-all hover:border-primary/30 hover:shadow-md"
        style={{ borderLeftColor: categoryColor.hex, borderLeftWidth: '3px' }}
      >
        {/* Header: icon + name + category + status + actions */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div
              className="rounded-md p-1.5 shrink-0"
              style={{ backgroundColor: `${categoryColor.hex}20` }}
            >
              <Sparkles className="h-3.5 w-3.5" style={{ color: categoryColor.hex }} />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-medium text-sm truncate" title={service.name}>
                {service.name}
              </h4>
              <p className="text-[10px] text-muted-foreground truncate">
                {service.category}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Badge
              variant={service.is_active ? 'default' : 'secondary'}
              className="text-[10px] h-5 shrink-0"
            >
              {service.is_active ? 'Ativo' : 'Inativo'}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.(service);
                  }}
                  className="gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                {canDelete && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive gap-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteDialog(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Description */}
        {service.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2 min-h-[2rem]">
            {service.description}
          </p>
        )}

        {/* Meta: duration */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{service.duration} min</span>
          </div>
          {service.return_days ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px]">Retorno {service.return_days}d</span>
            </div>
          ) : null}
        </div>

        {/* Footer: price */}
        <div className="mt-auto pt-2 border-t flex items-center justify-between">
          <div className="flex items-center gap-1 text-sm font-semibold">
            <DollarSign className="h-3.5 w-3.5 text-success" />
            <span>
              R${' '}
              {Number(service.price).toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{
              color: categoryColor.hex,
              backgroundColor: `${categoryColor.hex}15`,
            }}
          >
            {service.category}
          </span>
        </div>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Serviço</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o serviço "{service.name}"? Esta ação não pode ser desfeita.
              <br />
              <br />
              <strong className="text-destructive">Atenção:</strong> Serviços com agendamentos vinculados não podem ser excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
