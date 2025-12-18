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

  // Sales data query
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['dashboard_sales', professionalId],
    queryFn: async () => {
      // Get appointments with payment_status = 'paid'
      let appointmentsQuery = supabase
        .from('appointments')
        .select(`
          id,
          start_time,
          amount_paid,
          payment_status,
          professional_id,
          service:services(id, name, price)
        `)
        .eq('payment_status', 'paid');

      if (professionalId) {
        appointmentsQuery = appointmentsQuery.eq('professional_id', professionalId);
      }

      const { data: appointments, error: appointmentsError } = await appointmentsQuery;
      if (appointmentsError) throw appointmentsError;

      // Get single sales
      let salesQuery = supabase
        .from('single_sales')
        .select('*');

      const { data: singleSales, error: salesError } = await salesQuery;
      if (salesError) throw salesError;

      // Calculate periods
      const todayStart = startOfDay(today);
      const todayEnd = endOfDay(today);
      const monthStart = startOfMonth(today);
      const monthEnd = endOfMonth(today);
      const yearStart = startOfYear(today);
      const yearEnd = endOfYear(today);
      const lastMonthStart = startOfMonth(subMonths(today, 1));
      const lastMonthEnd = endOfMonth(subMonths(today, 1));

      // Filter appointments by period
      const filterByPeriod = (items: any[], start: Date, end: Date, dateField: string = 'start_time') => {
        return items.filter(item => {
          const date = parseISO(item[dateField]);
          return date >= start && date <= end;
        });
      };

      // Calculate appointment revenue
      const getAppointmentRevenue = (items: any[]) => {
        return items.reduce((sum, item) => sum + (Number(item.amount_paid) || Number(item.service?.price) || 0), 0);
      };

      // Calculate single sales revenue
      const getSalesRevenue = (items: any[]) => {
        return items.reduce((sum, item) => sum + Number(item.final_amount || 0), 0);
      };

      // Today
      const todayAppointments = filterByPeriod(appointments || [], todayStart, todayEnd);
      const todaySales = filterByPeriod(singleSales || [], todayStart, todayEnd, 'sale_date');
      const dailyRevenue = getAppointmentRevenue(todayAppointments) + getSalesRevenue(todaySales);

      // This month
      const monthAppointments = filterByPeriod(appointments || [], monthStart, monthEnd);
      const monthSales = filterByPeriod(singleSales || [], monthStart, monthEnd, 'sale_date');
      const monthlyRevenue = getAppointmentRevenue(monthAppointments) + getSalesRevenue(monthSales);

      // Last month (for comparison)
      const lastMonthAppointments = filterByPeriod(appointments || [], lastMonthStart, lastMonthEnd);
      const lastMonthSales = filterByPeriod(singleSales || [], lastMonthStart, lastMonthEnd, 'sale_date');
      const lastMonthRevenue = getAppointmentRevenue(lastMonthAppointments) + getSalesRevenue(lastMonthSales);

      // This year
      const yearAppointments = filterByPeriod(appointments || [], yearStart, yearEnd);
      const yearSales = filterByPeriod(singleSales || [], yearStart, yearEnd, 'sale_date');
      const yearlyRevenue = getAppointmentRevenue(yearAppointments) + getSalesRevenue(yearSales);

      // Monthly comparison percentage
      const monthlyComparison = lastMonthRevenue > 0 
        ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 
        : 0;

      return {
        daily: dailyRevenue,
        monthly: monthlyRevenue,
        yearly: yearlyRevenue,
        lastMonth: lastMonthRevenue,
        monthlyComparison,
        todayAppointmentsCount: todayAppointments.length,
        monthAppointmentsCount: monthAppointments.length,
      };
    },
  });

  // Monthly sales chart data (last 6 months)
  const { data: monthlySalesChart, isLoading: chartLoading } = useQuery({
    queryKey: ['dashboard_monthly_chart', professionalId],
    queryFn: async () => {
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const date = subMonths(today, i);
        const start = startOfMonth(date);
        const end = endOfMonth(date);

        let appointmentsQuery = supabase
          .from('appointments')
          .select('amount_paid, service:services(price)')
          .eq('payment_status', 'paid')
          .gte('start_time', start.toISOString())
          .lte('start_time', end.toISOString());

        if (professionalId) {
          appointmentsQuery = appointmentsQuery.eq('professional_id', professionalId);
        }

        const { data: appointments } = await appointmentsQuery;

        const { data: sales } = await supabase
          .from('single_sales')
          .select('final_amount')
          .gte('sale_date', start.toISOString())
          .lte('sale_date', end.toISOString());

        const appointmentRevenue = (appointments || []).reduce(
          (sum, a) => sum + (Number(a.amount_paid) || Number(a.service?.price) || 0), 0
        );
        const salesRevenue = (sales || []).reduce((sum, s) => sum + Number(s.final_amount || 0), 0);

        months.push({
          month: format(date, 'MMM'),
          fullMonth: format(date, 'MMMM yyyy'),
          revenue: appointmentRevenue + salesRevenue,
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
