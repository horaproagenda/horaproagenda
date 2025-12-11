import { useState, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useClients } from '@/hooks/useClients';
import { DuplicateClientAlert } from './DuplicateClientAlert';

const clientSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100, 'Nome muito longo'),
  email: z.string().trim().email('Email inválido').max(255, 'Email muito longo').or(z.literal('')),
  phone: z.string().trim().min(10, 'Telefone deve ter pelo menos 10 dígitos').max(20, 'Telefone muito longo'),
  birthdate: z.string().optional(),
  notes: z.string().trim().max(500, 'Observações muito longas').optional(),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface NewClientDialogProps {
  onClientCreated?: () => void;
  children?: React.ReactNode;
}

export function NewClientDialog({ onClientCreated, children }: NewClientDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { clients } = useClients();

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      birthdate: '',
      notes: '',
    },
  });

  const watchedName = useWatch({ control: form.control, name: 'name' });
  const watchedPhone = useWatch({ control: form.control, name: 'phone' });
  const watchedEmail = useWatch({ control: form.control, name: 'email' });

  const duplicatesByName = useMemo(() => {
    if (!watchedName || watchedName.length < 3) return [];
    const searchTerm = watchedName.toLowerCase().trim();
    return clients.filter(client => 
      client.name.toLowerCase().includes(searchTerm) || 
      searchTerm.includes(client.name.toLowerCase())
    ).slice(0, 3);
  }, [watchedName, clients]);

  const duplicatesByPhone = useMemo(() => {
    if (!watchedPhone || watchedPhone.length < 8) return [];
    const cleanPhone = watchedPhone.replace(/\D/g, '');
    return clients.filter(client => {
      const clientPhone = client.phone?.replace(/\D/g, '') || '';
      return clientPhone.includes(cleanPhone) || cleanPhone.includes(clientPhone);
    }).slice(0, 3);
  }, [watchedPhone, clients]);

  const duplicatesByEmail = useMemo(() => {
    if (!watchedEmail || watchedEmail.length < 5 || !watchedEmail.includes('@')) return [];
    const searchEmail = watchedEmail.toLowerCase().trim();
    return clients.filter(client => 
      client.email?.toLowerCase() === searchEmail
    ).slice(0, 3);
  }, [watchedEmail, clients]);

  const hasDuplicates = duplicatesByName.length > 0 || duplicatesByPhone.length > 0 || duplicatesByEmail.length > 0;

  const onSubmit = async (data: ClientFormData) => {
    if (hasDuplicates) {
      const confirmSubmit = window.confirm(
        'Foram encontrados clientes com dados similares. Deseja continuar com o cadastro mesmo assim?'
      );
      if (!confirmSubmit) return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.from('clients').insert({
        name: data.name,
        email: data.email || null,
        phone: data.phone,
        birthdate: data.birthdate || null,
        notes: data.notes || null,
      });

      if (error) throw error;

      toast.success('Cliente cadastrado com sucesso!');
      form.reset();
      setOpen(false);
      onClientCreated?.();
    } catch (error: any) {
      toast.error('Erro ao cadastrar cliente: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button className="gap-2">
            <UserPlus className="h-4 w-4" />
            Novo Cliente
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Cliente</DialogTitle>
          <DialogDescription>
            Preencha os dados do cliente para cadastrá-lo no sistema.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome completo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {duplicatesByName.length > 0 && (
              <DuplicateClientAlert duplicates={duplicatesByName} matchType="name" />
            )}
            
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone *</FormLabel>
                  <FormControl>
                    <Input placeholder="(11) 99999-9999" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {duplicatesByPhone.length > 0 && (
              <DuplicateClientAlert duplicates={duplicatesByPhone} matchType="phone" />
            )}

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="email@exemplo.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {duplicatesByEmail.length > 0 && (
              <DuplicateClientAlert duplicates={duplicatesByEmail} matchType="email" />
            )}

            <FormField
              control={form.control}
              name="birthdate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Nascimento</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
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
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Alergias, preferências, etc."
                      className="resize-none"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Salvando...' : 'Cadastrar'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
