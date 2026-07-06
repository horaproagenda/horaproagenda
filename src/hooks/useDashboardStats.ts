import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, format, parseISO } from 'date-fns';

interface DashboardFilters {
  professionalId?: string | null;
  startDate?: Date;
  endDate?: Date;
}

export function useDashboardStats(filters: DashboardFilters = {}) {
  const today = new Date();
  const { professionalId } = filters;

  // Sales data query — usa financial_entries (dinheiro efetivamente recebido)
  // como fonte de verdade. Assim, pacotes já pagos anteriormente NÃO são
  // contados de novo em "Vendas Hoje" quando uma sessão do pacote ocorre hoje.
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['dashboard_sales', professionalId],
    queryFn: async () => {
      const todayStart = startOfDay(today);
      const todayEnd = endOfDay(today);
      const monthStart = startOfMonth(today);
      const monthEnd = endOfMonth(today);
      const yearStart = startOfYear(today);
      const yearEnd = endOfYear(today);
      const lastMonthStart = startOfMonth(subMonths(today, 1));
      const lastMonthEnd = endOfMonth(subMonths(today, 1));

      // Receita recebida: financial_entries type=income + status=paid + paid_at no período
      let entriesQuery = supabase
        .from('financial_entries')
        .select('amount, paid_at, professional_id, type, status')
        .eq('type', 'income')
        .eq('status', 'paid')
        .gte('paid_at', yearStart.toISOString())
        .lte('paid_at', yearEnd.toISOString())
        .not('paid_at', 'is', null);

      if (professionalId) {
        entriesQuery = entriesQuery.eq('professional_id', professionalId);
      }

      const { data: entries, error: entriesError } = await entriesQuery;
      if (entriesError) throw entriesError;

      // Mês anterior separado (fora do intervalo do ano quando janeiro)
      let lastMonthQuery = supabase
        .from('financial_entries')
        .select('amount')
        .eq('type', 'income')
        .eq('status', 'paid')
        .gte('paid_at', lastMonthStart.toISOString())
        .lte('paid_at', lastMonthEnd.toISOString());
      if (professionalId) lastMonthQuery = lastMonthQuery.eq('professional_id', professionalId);
      const { data: lastMonthEntries } = await lastMonthQuery;

      // Contagem de agendamentos (para métrica de "atendimentos", não receita)
      let apptQuery = supabase
        .from('appointments')
        .select('id, start_time, professional_id, status')
        .gte('start_time', monthStart.toISOString())
        .lte('start_time', monthEnd.toISOString())
        .not('status', 'eq', 'cancelled');
      if (professionalId) apptQuery = apptQuery.eq('professional_id', professionalId);
      const { data: appointments } = await apptQuery;

      const sumInRange = (items: any[] | null, start: Date, end: Date) =>
        (items || []).reduce((sum, it) => {
          const d = it.paid_at ? parseISO(it.paid_at) : null;
          if (!d || d < start || d > end) return sum;
          return sum + Number(it.amount || 0);
        }, 0);

      const dailyRevenue = sumInRange(entries, todayStart, todayEnd);
      const monthlyRevenue = sumInRange(entries, monthStart, monthEnd);
      const yearlyRevenue = sumInRange(entries, yearStart, yearEnd);
      const lastMonthRevenue = (lastMonthEntries || []).reduce(
        (s, e) => s + Number(e.amount || 0),
        0,
      );

      const todayAppointmentsCount = (appointments || []).filter((a) => {
        const d = parseISO(a.start_time);
        return d >= todayStart && d <= todayEnd;
      }).length;

      const monthlyComparison =
        lastMonthRevenue > 0
          ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
          : 0;

      return {
        daily: dailyRevenue,
        monthly: monthlyRevenue,
        yearly: yearlyRevenue,
        lastMonth: lastMonthRevenue,
        monthlyComparison,
        todayAppointmentsCount,
        monthAppointmentsCount: (appointments || []).length,
      };
    },
  });

  // Monthly sales chart data (last 6 months) — usa financial_entries pagos
  const { data: monthlySalesChart, isLoading: chartLoading } = useQuery({
    queryKey: ['dashboard_monthly_chart', professionalId],
    queryFn: async () => {
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const date = subMonths(today, i);
        const start = startOfMonth(date);
        const end = endOfMonth(date);

        let q = supabase
          .from('financial_entries')
          .select('amount')
          .eq('type', 'income')
          .eq('status', 'paid')
          .gte('paid_at', start.toISOString())
          .lte('paid_at', end.toISOString());
        if (professionalId) q = q.eq('professional_id', professionalId);
        const { data: entries } = await q;

        const revenue = (entries || []).reduce((s, e) => s + Number(e.amount || 0), 0);

        months.push({
          month: format(date, 'MMM'),
          fullMonth: format(date, 'MMMM yyyy'),
          revenue,
        });
      }
      return months;
    },
  });

  // New clients per month
  const { data: newClientsChart } = useQuery({
    queryKey: ['dashboard_new_clients'],
    queryFn: async () => {
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const date = subMonths(today, i);
        const start = startOfMonth(date);
        const end = endOfMonth(date);

        const { count } = await supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString());

        months.push({
          month: format(date, 'MMM'),
          count: count || 0,
        });
      }
      return months;
    },
  });

  // Services distribution
  const { data: servicesDistribution } = useQuery({
    queryKey: ['dashboard_services_distribution', professionalId],
    queryFn: async () => {
      const monthStart = startOfMonth(today);
      const monthEnd = endOfMonth(today);

      let query = supabase
        .from('appointments')
        .select('service:services(id, name, category)')
        .gte('start_time', monthStart.toISOString())
        .lte('start_time', monthEnd.toISOString())
        .not('status', 'eq', 'cancelled');

      if (professionalId) {
        query = query.eq('professional_id', professionalId);
      }

      const { data } = await query;

      const serviceCount: Record<string, { name: string; category: string; count: number }> = {};
      (data || []).forEach((apt: any) => {
        if (apt.service) {
          const key = apt.service.id;
          if (!serviceCount[key]) {
            serviceCount[key] = { name: apt.service.name, category: apt.service.category, count: 0 };
          }
          serviceCount[key].count++;
        }
      });

      return Object.values(serviceCount)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    },
  });

  // Total clients
  const { data: totalClients } = useQuery({
    queryKey: ['dashboard_total_clients'],
    queryFn: async () => {
      const { count } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      return count || 0;
    },
  });

  // Daily cash flow
  const { data: dailyCashFlow } = useQuery({
    queryKey: ['dashboard_cash_flow'],
    queryFn: async () => {
      const { data: register } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('status', 'open')
        .maybeSingle();

      if (!register) return null;

      const { data: transactions } = await supabase
        .from('cash_transactions')
        .select('*')
        .eq('cash_register_id', register.id);

      const income = (transactions || [])
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      
      const expense = (transactions || [])
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      return {
        opening: Number(register.opening_balance),
        income,
        expense,
        current: Number(register.opening_balance) + income - expense,
        status: register.status,
      };
    },
  });

  return {
    salesData,
    monthlySalesChart,
    newClientsChart,
    servicesDistribution,
    totalClients,
    dailyCashFlow,
    isLoading: salesLoading || chartLoading,
  };
}
