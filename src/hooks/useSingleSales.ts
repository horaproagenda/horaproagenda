import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { deductStockForSale } from '@/lib/saleStockDeduction';

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

      // 3. If it's a package sale with a client, create a client package marked as PAID
      if (sale.item_type === 'package' && sale.package_id && sale.client_id) {
        // Get the package template data (from service_packages acting as template)
        const { data: packageTemplate } = await (supabase as any)
          .from('service_packages')
          .select('*, appointments:package_appointments(*)')
          .eq('id', sale.package_id)
          .single();

        if (packageTemplate) {
          // Create a new client-specific package (copy of the template)
          // Mark as PAID since payment was made at the cash register
          const { data: clientPackage, error: pkgError } = await supabase
            .from('service_packages')
            .insert({
              name: packageTemplate.name,
              description: packageTemplate.description,
              client_id: sale.client_id,
              template_id: packageTemplate.template_id || null,
              total_sessions: packageTemplate.total_sessions,
              duration: packageTemplate.duration || 60,
              interval_days: packageTemplate.interval_days || 7,
              total_price: sale.final_amount,
              package_type: packageTemplate.package_type || 'standard',
              service_id: packageTemplate.service_id || null,
              professional_id: packageTemplate.professional_id,
              room_id: packageTemplate.room_id,
              equipment: packageTemplate.equipment || [],
              payment_methods: sale.payment_method_id ? [sale.payment_method_id] : [],
              payment_type: 'full', // Always full payment when sold via cash register
              sessions_scheduled: 0,
              is_active: true,
              category: packageTemplate.category || 'Pago via Caixa',
            })
            .select()
            .single();

          if (!pkgError && clientPackage) {
            // Fonte da verdade das etapas: package_template_steps do template
            // original (se houver). Só cai no fallback quando o pacote não é
            // sequencial ou o template não tem steps cadastrados.
            let templateSteps: any[] = [];
            const sourceTemplateId = packageTemplate.template_id || packageTemplate.id;
            if (packageTemplate.package_type === 'sequential' && sourceTemplateId) {
              const { data: tplSteps } = await (supabase as any)
                .from('package_template_steps')
                .select('service_id, sequence_order, interval_after_days')
                .eq('template_id', sourceTemplateId)
                .order('sequence_order', { ascending: true });
              templateSteps = tplSteps || [];
            }

            const packageSteps = templateSteps.length
              ? templateSteps
              : (packageTemplate.package_type === 'sequential' && packageTemplate.appointments?.length
                ? packageTemplate.appointments.sort((a: any, b: any) => (a.sequence_order || a.session_number) - (b.sequence_order || b.session_number))
                : Array.from({ length: packageTemplate.total_sessions }, (_, i) => ({
                    service_id: packageTemplate.service_id || null,
                    interval_after_days: packageTemplate.interval_days || 7,
                    sequence_order: i + 1,
                  })));

            const sessions = packageSteps.map((step: any, i: number) => ({
              package_id: clientPackage.id,
              service_id: step.service_id || packageTemplate.service_id || null,
              session_number: i + 1,
              original_session_number: i + 1,
              sequence_order: step.sequence_order || i + 1,
              interval_after_days: i === packageSteps.length - 1 ? 0 : step.interval_after_days || packageTemplate.interval_days || 7,
              status: 'pending',
              notes: 'Pacote pago integralmente via Caixa',
            }));

            await supabase.from('package_appointments').insert(sessions);


            // Update the single_sale to reference the new client package (not the template)
            await supabase
              .from('single_sales')
              .update({ package_id: clientPackage.id })
              .eq('id', saleData.id);
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
        // Get the actual name of the service or package
        let itemName = sale.description || 'Item avulso';
        
        if (sale.service_id) {
          const { data: serviceData } = await supabase
            .from('services')
            .select('name')
            .eq('id', sale.service_id)
            .single();
          if (serviceData?.name) {
            itemName = serviceData.name;
          }
        } else if (sale.package_id) {
          const { data: packageData } = await supabase
            .from('service_packages')
            .select('name')
            .eq('id', sale.package_id)
            .single();
          if (packageData?.name) {
            itemName = packageData.name;
          }
        }

        // Resolve payment method name from ID for proper categorization
        let paymentMethodName: string | null = null;
        if (sale.payment_method_id) {
          const { data: pmData } = await supabase
            .from('payment_methods')
            .select('name')
            .eq('id', sale.payment_method_id)
            .single();
          if (pmData?.name) {
            paymentMethodName = pmData.name;
          }
        }
        
        await supabase.from('cash_transactions').insert({
          cash_register_id: openCashRegister.id,
          type: 'income',
          category: sale.item_type === 'package' ? 'Venda de Pacote' : 'Venda de Serviço',
          description: `Venda: ${itemName}`,
          amount: sale.final_amount,
          payment_method: paymentMethodName || sale.payment_method_id,
          reference_id: saleData.id,
          reference_type: 'single_sale',
          created_by: user?.id,
        });
      }

      // 6. Create a financial entry for tracking (RECEIVABLE = income)
      // Get the actual name of the service or package for financial entry
      let financialItemName = sale.description || 'Item avulso';
      
      if (sale.service_id) {
        const { data: serviceData } = await supabase
          .from('services')
          .select('name')
          .eq('id', sale.service_id)
          .single();
        if (serviceData?.name) {
          financialItemName = serviceData.name;
        }
      } else if (sale.package_id) {
        const { data: packageData } = await supabase
          .from('service_packages')
          .select('name')
          .eq('id', sale.package_id)
          .single();
        if (packageData?.name) {
          financialItemName = packageData.name;
        }
      }
      
      await supabase.from('financial_entries').insert({
        type: 'receivable',
        description: `Venda: ${financialItemName}`,
        amount: sale.final_amount,
        due_date: sale.sale_date,
        paid_date: sale.sale_date,
        status: 'paid',
        payment_method_id: sale.payment_method_id,
        client_id: sale.client_id,
        created_by: user?.id,
        sale_id: saleData.id,
      } as any);

      // 7. Deduzir estoque em tempo real para serviço/pacote vendido
      await deductStockForSale({
        saleId: saleData.id,
        itemType: sale.item_type,
        serviceId: sale.service_id,
        packageId: sale.package_id,
        userId: user?.id ?? null,
      });

      return { saleData, clientId: sale.client_id };
    },
    onMutate: async (newSale) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['single_sales'] });
      await queryClient.cancelQueries({ queryKey: ['cash_transactions'] });
      await queryClient.cancelQueries({ queryKey: ['client_services'] });

      // Snapshot the previous value
      const previousSales = queryClient.getQueryData(['single_sales']);

      // Optimistically add the sale
      const optimisticSale = {
        id: `temp-${Date.now()}`,
        ...newSale,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      queryClient.setQueryData(['single_sales'], (old: SingleSale[] | undefined) => {
        return [optimisticSale, ...(old || [])];
      });

      return { previousSales };
    },
    onSuccess: (result) => {
      // Invalidate all related queries immediately
      const clientId = result.clientId;
      
      // Force immediate refetch of all related data
      queryClient.invalidateQueries({ queryKey: ['single_sales'] });
      queryClient.invalidateQueries({ queryKey: ['cash_registers'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_services'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client-sales'] });
      queryClient.invalidateQueries({ queryKey: ['client_credits'] });
      queryClient.invalidateQueries({ queryKey: ['clients_credits'] });
      queryClient.invalidateQueries({ queryKey: ['client'] });
      
      // Also invalidate client-specific package query if we have client_id
      if (clientId) {
        queryClient.invalidateQueries({ queryKey: ['client_packages', clientId] });
        queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      }
      
      toast.success('Venda registrada com sucesso!');
    },
    onError: (error: any, _, context) => {
      // Rollback on error
      if (context?.previousSales) {
        queryClient.setQueryData(['single_sales'], context.previousSales);
      }
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

  // Limpeza definitiva: apaga venda + boletos + pacote + agendamentos + financeiro + caixa
  const purgeSale = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).rpc('purge_single_sale_cascade', { _sale_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['single_sales'] });
      queryClient.invalidateQueries({ queryKey: ['client-sales'] });
      queryClient.invalidateQueries({ queryKey: ['client-appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['service_packages'] });
      queryClient.invalidateQueries({ queryKey: ['client_packages'] });
      queryClient.invalidateQueries({ queryKey: ['package_appointments'] });
      queryClient.invalidateQueries({ queryKey: ['client_services'] });
      queryClient.invalidateQueries({ queryKey: ['financial_entries'] });
      queryClient.invalidateQueries({ queryKey: ['cash_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['boleto_installments'] });
      toast.success('Venda removida e fluxo financeiro/agenda sincronizados.');
    },
    onError: (error: any) => {
      toast.error('Erro ao remover venda: ' + (error.message || 'desconhecido'));
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
    purgeSale,
  };
}
