import { useState } from 'react';
import { Clock, DollarSign, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Service } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
      <div 
        className="group rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:border-primary/30 hover:shadow-lg animate-fade-in"
        style={{ borderTopColor: categoryColor.hex, borderTopWidth: '3px' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-foreground">{service.name}</h4>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
              {service.description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className="shrink-0"
              style={{ backgroundColor: `${categoryColor.hex}15`, borderColor: `${categoryColor.hex}40` }}
            >
              {service.category}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.(service);
                }}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar
                </DropdownMenuItem>
                {canDelete && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteDialog(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{service.duration} min</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <DollarSign className="h-4 w-4 text-success" />
            <span>R$ {service.price.toFixed(2)}</span>
          </div>
          {!service.is_active && (
            <Badge variant="secondary" className="ml-auto">Inativo</Badge>
          )}
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Serviço</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o serviço "{service.name}"? 
              Esta ação não pode ser desfeita.
              <br /><br />
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
