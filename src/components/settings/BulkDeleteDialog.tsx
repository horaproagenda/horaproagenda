import { useState } from 'react';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useQueryClient } from '@tanstack/react-query';

type DeleteType = 'clients' | 'appointments' | 'services' | 'packages' | 'products' | 'financial';

interface DeleteOption {
  type: DeleteType;
  label: string;
  description: string;
  confirmText: string;
  tables: string[];
}

const deleteOptions: DeleteOption[] = [
  {
    type: 'clients',
    label: 'Clientes',
    description: 'Excluir todos os clientes cadastrados',
    confirmText: 'EXCLUIR CLIENTES',
    tables: ['clients'],
  },
  {
    type: 'appointments',
    label: 'Agendamentos',
    description: 'Excluir todos os agendamentos',
    confirmText: 'EXCLUIR AGENDAMENTOS',
    tables: ['appointments'],
  },
  {
    type: 'services',
    label: 'Serviços',
    description: 'Excluir todos os serviços cadastrados',
    confirmText: 'EXCLUIR SERVIÇOS',
    tables: ['services'],
  },
  {
    type: 'packages',
    label: 'Pacotes',
    description: 'Excluir todos os pacotes e modelos de pacotes',
    confirmText: 'EXCLUIR PACOTES',
    tables: ['package_appointments', 'service_packages', 'package_templates'],
  },
  {
    type: 'products',
    label: 'Produtos',
    description: 'Excluir todos os produtos cadastrados',
    confirmText: 'EXCLUIR PRODUTOS',
    tables: ['product_purchases', 'service_products', 'products'],
  },
  {
    type: 'financial',
    label: 'Financeiro',
    description: 'Excluir todas as entradas financeiras e vendas',
    confirmText: 'EXCLUIR FINANCEIRO',
    tables: ['cash_transactions', 'single_sales', 'financial_entries'],
  },
];

export function BulkDeleteDialog() {
  const queryClient = useQueryClient();
  const [selectedOption, setSelectedOption] = useState<DeleteOption | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!selectedOption || confirmInput !== selectedOption.confirmText) {
      toast.error('Digite o texto de confirmação corretamente');
      return;
    }

    setIsDeleting(true);
    try {
      // Delete from all related tables in order
      for (const table of selectedOption.tables) {
        const { error } = await supabase
          .from(table as any)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

        if (error) {
          console.error(`Erro ao excluir ${table}:`, error);
          throw new Error(`Erro ao excluir ${table}: ${error.message}`);
        }
      }

      // Invalidate all queries
      queryClient.invalidateQueries();
      
      toast.success(`${selectedOption.label} excluídos com sucesso!`);
      setSelectedOption(null);
      setConfirmInput('');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao excluir dados');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card className="border-destructive/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-destructive/10 p-2">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-lg text-destructive">Zona de Perigo</CardTitle>
              <CardDescription>Exclusão em massa de dados (irreversível)</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Atenção!</p>
                <p className="text-muted-foreground">
                  Estas ações são <strong>permanentes e irreversíveis</strong>. 
                  Todos os dados selecionados serão excluídos definitivamente.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            {deleteOptions.map((option) => (
              <Button
                key={option.type}
                variant="outline"
                className="justify-between h-auto py-3 border-destructive/30 hover:bg-destructive/5 hover:border-destructive"
                onClick={() => setSelectedOption(option)}
              >
                <div className="text-left">
                  <p className="font-medium">Excluir todos os {option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </div>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!selectedOption} onOpenChange={(open) => !open && setSelectedOption(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                Você está prestes a excluir <strong>TODOS</strong> os {selectedOption?.label.toLowerCase()}.
                Esta ação é <strong>permanente e irreversível</strong>.
              </p>
              <div className="space-y-2">
                <Label>Para confirmar, digite: <strong className="text-destructive">{selectedOption?.confirmText}</strong></Label>
                <Input
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value.toUpperCase())}
                  placeholder="Digite o texto de confirmação"
                  className="font-mono"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmInput('')}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={confirmInput !== selectedOption?.confirmText || isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir Permanentemente'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
