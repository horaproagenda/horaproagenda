import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SingleSale {
  id: string;
  client_id: string | null;
  service_id: string | null;
  package_id: string | null;
  item_type: 'service' | 'package';
  description: string | null;
  original_amount: number;
  discount_amount: number;
  final_amount: number;
  payment_method_id: string | null;
  bank_id: string | null;
  sale_date: string;
  notes: string | null;
  created_by: string | null;
  paid_by: string | null;
  paid_at: string | null;
  installments: number;
  card_fee_amount: number;
  created_at: string;
  updated_at: string;
  client?: { id: string; name: string };
  service?: { id: string; name: string; price: number };
  package?: { id: string; name: string; total_price: number };
  payment_method?: { id: string; name: string };
  bank?: { id: string; name: string };
}

export function useSingleSales() {
  const queryClient = useQueryClient();

  const { data: sales = [], isLoading, refetch } = useQuery({
    queryKey: ['single_sales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('single_sales')
        .select(`
          *,
          client:clients(id, name),
          service:services(id, name, price),
          package:service_packages(id, name, total_price),
          payment_method:payment_methods(id, name),
          bank:banks(id, name)
        `)
        .order('sale_date', { ascending: false });

      if (error) throw error;
      return data as SingleSale[];
    },
  });

  const createSale = useMutation({
    mutationFn: async (sale: Omit<SingleSale, 'id' | 'created_at' | 'updated_at' | 'client' | 'service' | 'payment_method' | 'bank' | 'package'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // 1. Get the current open cash register
      const { data: openCashRegister } = await supabase
        .from('cash_registers')
        .select('id')
        .eq('status', 'open')
        .maybeSingle();

      // 2. Create the sale record
      const { data: saleData, error: saleError } = await supabase
        .from('single_sales')
        .insert({
          ...sale,
          created_by: user?.id,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // 3. If it's a package sale with a client, create a client package with paid sessions
      if (sale.item_type === 'package' && sale.package_id && sale.client_id) {
        // Get the package template data
        const { data: packageTemplate } = await supabase
          .from('service_packages')
          .select('*')
          .eq('id', sale.package_id)
          .single();

        if (packageTemplate) {
          // Create a new client-specific package (copy of the template)
          const { data: clientPackage, error: pkgError } = await supabase
            .from('service_packages')
            .insert({
              name: packageTemplate.name,
              description: packageTemplate.description,
              client_id: sale.client_id,
              template_id: packageTemplate.id, // Store the original package id as template_id
              total_sessions: packageTemplate.total_sessions,
              duration: packageTemplate.duration || 60,
              interval_days: packageTemplate.interval_days || 7,
              total_price: sale.final_amount,
              professional_id: packageTemplate.professional_id,
              room_id: packageTemplate.room_id,
              equipment: packageTemplate.equipment || [],
              payment_methods: sale.payment_method_id ? [sale.payment_method_id] : [],
              sessions_scheduled: 0,
              is_active: true,
              category: 'Pago via Caixa',
            })
            .select()
            .single();

          if (!pkgError && clientPackage) {
            // Create pending sessions for the package
            const sessions = Array.from({ length: packageTemplate.total_sessions }, (_, i) => ({
              package_id: clientPackage.id,
              session_number: i + 1,
              status: 'pending',
            }));

            await supabase.from('package_appointments').insert(sessions);
          }
        }
      }

      // 4. If it's a service sale with a client, create a client_service record
      if (sale.item_type === 'service' && sale.service_id && sale.client_id) {
        // Create a redeemable service for the client
        await supabase.from('client_services').insert({
          client_id: sale.client_id,
          service_id: sale.service_id,
          sale_id: saleData.id,
          amount_paid: sale.final_amount,
          status: 'available',
          created_by: user?.id,
        });
      }

      // 5. Create a cash transaction to update the cash register immediately
      if (openCashRegister) {
        await supabase.from('cash_transactions').insert({
          cash_register_id: openCashRegister.id,
          type: 'income',
          category: sale.item_type === 'package' ? 'Venda de Pacote' : 'Venda de Serviço',
          description: `Venda: ${sale.description || 'Item avulso'}`,
          amount: sale.final_amount,
          payment_method: sale.payment_method_id,
          reference_id: saleData.id,
          reference_type: 'single_sale',
          created_by: user?.id,
        });
      }

      // 6. Create a financial entry for tracking (INCOME, not expense)
      await supabase.from('financial_entries').insert({
        type: 'income',
        description: `Venda: ${sale.description || 'Item avulso'}`,
        amount: sale.final_amount,
        due_date: sale.sale_date,
        paid_date: sale.sale_date,
        status: 'paid',
        payment_method_id: sale.payment_method_id,
        client_id: sale.client_id,
        created_by: user?.id,
      });

      return saleData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['single_sales'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_services'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      toast.success('Venda registrada com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao registrar venda: ' + error.message);
    },
  });

  const deleteSale = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('single_sales')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['single_sales'] });
      toast.success('Venda excluída com sucesso!');
    },
    onError: (error: any) => {
      toast.error('Erro ao excluir venda: ' + error.message);
    },
  });

  const totalSales = sales.reduce((sum, s) => sum + Number(s.final_amount), 0);

  return {
    sales,
    totalSales,
    isLoading,
    refetch,
    createSale,
    deleteSale,
  };
}
