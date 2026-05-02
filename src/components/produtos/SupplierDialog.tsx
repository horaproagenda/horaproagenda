import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Truck } from 'lucide-react';
import { useSuppliers, type Supplier } from '@/hooks/useSuppliers';
import { supplierSchema, type SupplierFormData } from '@/lib/validationSchemas';

interface SupplierDialogProps {
  editingSupplier?: Supplier | null;
  onClose?: () => void;
  trigger?: React.ReactNode;
}

export function SupplierDialog({ editingSupplier, onClose, trigger }: SupplierDialogProps) {
  const { createSupplier, updateSupplier } = useSuppliers();
  const [open, setOpen] = useState(false);

  const form = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      contact_name: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
      is_active: true,
      cnpj: '',
      uf: '',
      company_name: '',
      state_registration: '',
      municipal_registration: '',
    },
  });

  // Reset form when editing supplier changes
  useEffect(() => {
    if (editingSupplier) {
      form.reset({
        name: editingSupplier.name || '',
        contact_name: editingSupplier.contact_name || '',
        email: editingSupplier.email || '',
        phone: editingSupplier.phone || '',
        address: editingSupplier.address || '',
        notes: editingSupplier.notes || '',
        is_active: editingSupplier.is_active ?? true,
        cnpj: editingSupplier.cnpj || '',
        uf: editingSupplier.uf || '',
        company_name: editingSupplier.company_name || '',
        state_registration: editingSupplier.state_registration || '',
        municipal_registration: editingSupplier.municipal_registration || '',
      });
    }
  }, [editingSupplier, form]);

  const resetForm = () => {
    form.reset({
      name: '',
      contact_name: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
      is_active: true,
      cnpj: '',
      uf: '',
      company_name: '',
      state_registration: '',
      municipal_registration: '',
    });
  };

  const onSubmit = async (data: SupplierFormData) => {
    const supplierData = {
      name: data.name,
      is_active: data.is_active,
      contact_name: data.contact_name || null,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      notes: data.notes || null,
      cnpj: data.cnpj || null,
      uf: data.uf?.toUpperCase() || null,
      company_name: data.company_name || null,
      state_registration: data.state_registration || null,
      municipal_registration: data.municipal_registration || null,
    };

    if (editingSupplier) {
      await updateSupplier.mutateAsync({ id: editingSupplier.id, ...supplierData });
    } else {
      await createSupplier.mutateAsync(supplierData);
    }

    setOpen(false);
    resetForm();
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => {
      setOpen(o);
      if (!o) {
        resetForm();
        onClose?.();
      }
    }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Truck className="h-3.5 w-3.5" />
            {editingSupplier ? 'Editar' : 'Novo Fornecedor'}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {editingSupplier ? 'Atualize as informações do fornecedor' : 'Cadastre um novo fornecedor'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-2.5 pb-2">
                <div className="grid grid-cols-2 gap-2.5">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Nome Fantasia *</FormLabel>
                        <FormControl>
                          <Input className="h-7 text-xs" placeholder="Nome do fornecedor" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="company_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Razão Social</FormLabel>
                        <FormControl>
                          <Input className="h-7 text-xs" placeholder="Razão social da empresa" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <FormField
                    control={form.control}
                    name="cnpj"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">CNPJ</FormLabel>
                        <FormControl>
                          <Input className="h-7 text-xs" placeholder="00.000.000/0000-00" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="uf"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">UF</FormLabel>
                        <FormControl>
                          <Input className="h-7 text-xs" 
                            placeholder="SP" 
                            maxLength={2}
                            {...field} 
                            value={field.value || ''}
                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <FormField
                    control={form.control}
                    name="state_registration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Inscrição Estadual</FormLabel>
                        <FormControl>
                          <Input className="h-7 text-xs" placeholder="Inscrição estadual" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="municipal_registration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Inscrição Municipal</FormLabel>
                        <FormControl>
                          <Input className="h-7 text-xs" placeholder="Inscrição municipal" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="contact_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Contato</FormLabel>
                      <FormControl>
                        <Input className="h-7 text-xs" placeholder="Nome do contato" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-2.5">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Email</FormLabel>
                        <FormControl>
                          <Input className="h-7 text-xs" type="email" placeholder="email@exemplo.com" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Telefone</FormLabel>
                        <FormControl>
                          <Input className="h-7 text-xs" placeholder="(00) 00000-0000" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Endereço</FormLabel>
                      <FormControl>
                        <Input className="h-7 text-xs" placeholder="Endereço completo" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Observações</FormLabel>
                      <FormControl>
                        <Textarea className="text-xs min-h-[60px]" 
                          placeholder="Observações adicionais" 
                          rows={2}
                          {...field} 
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-md border p-2">
                      <div>
                        <FormLabel className="text-xs">Fornecedor Ativo</FormLabel>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </ScrollArea>
            
            {/* Buttons OUTSIDE ScrollArea - always visible */}
            <div className="flex justify-end gap-2 pt-3 border-t mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                  onClose?.();
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createSupplier.isPending || updateSupplier.isPending}
              >
                {createSupplier.isPending || updateSupplier.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
