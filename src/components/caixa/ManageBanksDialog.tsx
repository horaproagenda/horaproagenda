import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Building2, Plus, Pencil, Trash2 } from 'lucide-react';
import { useBanks, Bank } from '@/hooks/useBanks';

export function ManageBanksDialog() {
  const { banks, activeBanks, createBank, updateBank, deleteBank, isLoading } = useBanks();
  const [open, setOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    bank_code: '',
    agency: '',
    account_number: '',
    description: '',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      bank_code: '',
      agency: '',
      account_number: '',
      description: '',
    });
    setEditingBank(null);
    setShowForm(false);
  };

  const handleEdit = (bank: Bank) => {
    setEditingBank(bank);
    setFormData({
      name: bank.name,
      bank_code: bank.bank_code || '',
      agency: bank.agency || '',
      account_number: bank.account_number || '',
      description: bank.description || '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) return;

    try {
      if (editingBank) {
        await updateBank.mutateAsync({
          id: editingBank.id,
          ...formData,
        });
      } else {
        await createBank.mutateAsync({
          ...formData,
          is_active: true,
        });
      }
      resetForm();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBank.mutateAsync(id);
      setDeleteConfirm(null);
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) resetForm();
      }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Building2 className="h-4 w-4 mr-2" />
            Gerenciar Bancos
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Gerenciar Bancos</DialogTitle>
          </DialogHeader>

          {showForm ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="name">Nome do Banco *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Banco do Brasil"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="bank_code">Código do Banco</Label>
                  <Input
                    id="bank_code"
                    value={formData.bank_code}
                    onChange={(e) => setFormData({ ...formData, bank_code: e.target.value })}
                    placeholder="Ex: 001"
                  />
                </div>
                <div>
                  <Label htmlFor="agency">Agência</Label>
                  <Input
                    id="agency"
                    value={formData.agency}
                    onChange={(e) => setFormData({ ...formData, agency: e.target.value })}
                    placeholder="Ex: 1234-5"
                  />
                </div>
                <div>
                  <Label htmlFor="account_number">Conta</Label>
                  <Input
                    id="account_number"
                    value={formData.account_number}
                    onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                    placeholder="Ex: 12345-6"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Descrição</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descrição opcional"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createBank.isPending || updateBank.isPending}>
                  {editingBank ? 'Salvar' : 'Cadastrar'}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex justify-end">
                <Button onClick={() => setShowForm(true)} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Banco
                </Button>
              </div>

              {isLoading ? (
                <p className="text-center text-muted-foreground py-4">Carregando...</p>
              ) : banks.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  Nenhum banco cadastrado
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Agência</TableHead>
                      <TableHead>Conta</TableHead>
                      <TableHead className="w-[100px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {banks.map((bank) => (
                      <TableRow key={bank.id}>
                        <TableCell className="font-medium">{bank.name}</TableCell>
                        <TableCell>{bank.bank_code || '-'}</TableCell>
                        <TableCell>{bank.agency || '-'}</TableCell>
                        <TableCell>{bank.account_number || '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(bank)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteConfirm(bank.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este banco? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
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
