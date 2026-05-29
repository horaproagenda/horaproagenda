import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Truck, Edit, Trash2, Plus, Phone, Mail } from 'lucide-react';
import { useSuppliers, type Supplier } from '@/hooks/useSuppliers';
import { SupplierDialog } from './SupplierDialog';
import { useAuth } from '@/contexts/AuthContext';

export function ManageSuppliersDialog() {
  const { suppliers, isLoading, deleteSupplier } = useSuppliers();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('receptionist');
  const canDelete = hasRole('admin');
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const handleDelete = async (id: string) => {
    await deleteSupplier.mutateAsync(id);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="warning" size="sm" className="h-8 gap-1.5 text-xs">
          <Truck className="h-3.5 w-3.5" />
          Fornecedores
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-base">Gerenciar Fornecedores</DialogTitle>
          <DialogDescription className="text-xs">
            Cadastre e gerencie seus fornecedores
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end mb-2">
          {canEdit && <SupplierDialog />}
        </div>

        <ScrollArea className="h-[400px]">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="h-8">
                <TableHead className="h-8 py-1.5 text-[11px]">Nome</TableHead>
                <TableHead className="h-8 py-1.5 text-[11px]">Contato</TableHead>
                <TableHead className="h-8 py-1.5 text-[11px]">Telefone</TableHead>
                <TableHead className="h-8 py-1.5 text-[11px]">Status</TableHead>
                <TableHead className="h-8 py-1.5 text-[11px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-xs">
                    <Truck className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    <p>Nenhum fornecedor cadastrado</p>
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map(supplier => (
                  <TableRow key={supplier.id}>
                    <TableCell className="py-1.5">
                      <div>
                        <p className="font-medium text-xs leading-tight">{supplier.name}</p>
                        {supplier.email && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                            <Mail className="h-2.5 w-2.5" />
                            {supplier.email}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 text-xs">{supplier.contact_name || '-'}</TableCell>
                    <TableCell className="py-1.5">
                      {supplier.phone ? (
                        <div className="flex items-center gap-1 text-xs">
                          <Phone className="h-2.5 w-2.5" />
                          {supplier.phone}
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Badge variant={supplier.is_active ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 h-4">
                        {supplier.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1.5 text-right">
                      <div className="flex gap-0.5 justify-end">
                        {canEdit && (
                          <SupplierDialog
                            editingSupplier={supplier}
                            onClose={() => setEditingSupplier(null)}
                            trigger={
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                            }
                          />
                        )}
                        {canDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir Fornecedor</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir "{supplier.name}"? Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(supplier.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
