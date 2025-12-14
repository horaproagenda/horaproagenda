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
        <Button variant="outline" className="gap-2">
          <Truck className="h-4 w-4" />
          Fornecedores
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Gerenciar Fornecedores</DialogTitle>
          <DialogDescription>
            Cadastre e gerencie seus fornecedores
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end mb-4">
          {canEdit && <SupplierDialog />}
        </div>

        <ScrollArea className="h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <Truck className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p>Nenhum fornecedor cadastrado</p>
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map(supplier => (
                  <TableRow key={supplier.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{supplier.name}</p>
                        {supplier.email && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {supplier.email}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{supplier.contact_name || '-'}</TableCell>
                    <TableCell>
                      {supplier.phone ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Phone className="h-3 w-3" />
                          {supplier.phone}
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={supplier.is_active ? 'default' : 'secondary'}>
                        {supplier.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {canEdit && (
                          <SupplierDialog
                            editingSupplier={supplier}
                            onClose={() => setEditingSupplier(null)}
                            trigger={
                              <Button variant="ghost" size="icon">
                                <Edit className="h-4 w-4" />
                              </Button>
                            }
                          />
                        )}
                        {canDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive">
                                <Trash2 className="h-4 w-4" />
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
