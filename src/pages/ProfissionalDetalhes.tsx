import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval, subDays, parseISO } from 'date-fns';
import { escapeHtml } from '@/lib/htmlSanitizer';
import { ptBR } from 'date-fns/locale';
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  DollarSign, 
  Clock,
  FileText,
  Shield,
  TrendingUp,
  Download,
  Filter
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageTransition } from '@/components/layout/PageTransition';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';

const PERMISSIONS_CONFIG = [
  { key: 'can_access_financial', label: 'Acessar Financeiro', category: 'financial' },
  { key: 'can_manage_payments', label: 'Dar baixa em pagamentos', category: 'financial' },
  { key: 'can_view_other_payments', label: 'Ver pagamentos de outros', category: 'financial' },
  { key: 'can_view_other_registers', label: 'Ver caixa de outros', category: 'financial' },
  { key: 'can_open_close_register', label: 'Abrir/fechar caixa', category: 'financial' },
  { key: 'can_view_daily_revenue', label: 'Ver receita do dia', category: 'financial' },
  { key: 'can_view_other_clients', label: 'Ver todos os clientes', category: 'clients' },
  { key: 'can_view_only_own_clients', label: 'Ver só próprios clientes', category: 'clients' },
  { key: 'can_view_other_agendas', label: 'Ver todas as agendas', category: 'agenda' },
  { key: 'can_view_only_own_agenda', label: 'Ver só própria agenda', category: 'agenda' },
  { key: 'can_modify_agenda', label: 'Modificar agenda', category: 'agenda' },
  { key: 'can_manage_products', label: 'Gerenciar produtos', category: 'products' },
  { key: 'can_view_other_reports', label: 'Ver todos os relatórios', category: 'reports' },
  { key: 'can_view_only_own_reports', label: 'Ver só próprios relatórios', category: 'reports' },
  { key: 'can_access_audit', label: 'Acessar auditoria', category: 'system' },
  { key: 'can_access_settings', label: 'Acessar configurações', category: 'system' },
];

const PERMISSION_CATEGORIES = [
  { key: 'financial', label: 'Financeiro', icon: '💰' },
  { key: 'clients', label: 'Clientes', icon: '👥' },
  { key: 'agenda', label: 'Agenda', icon: '📅' },
  { key: 'products', label: 'Produtos', icon: '📦' },
  { key: 'reports', label: 'Relatórios', icon: '📊' },
  { key: 'system', label: 'Sistema', icon: '⚙️' },
];

const formatCurrency = (value: number) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const PERIOD_OPTIONS = [
  { value: '30', label: 'Últimos 30 dias' },
  { value: '60', label: 'Últimos 60 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '180', label: 'Últimos 6 meses' },
  { value: '365', label: 'Último ano' },
  { value: 'custom', label: 'Período personalizado' },
];

export default function ProfissionalDetalhes() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('info');
  const [historyPeriod, setHistoryPeriod] = useState('90');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(new Date());
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);

  // Fetch professional data
  const { data: professional, isLoading: loadingProfessional } = useQuery({
    queryKey: ['professional', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professionals')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch all appointments for this professional (last 12 months)
  const { data: allAppointments = [] } = useQuery({
    queryKey: ['professional-all-appointments', id],
    queryFn: async () => {
      const twelveMonthsAgo = subMonths(new Date(), 12);
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          clients:client_id(name, phone),
          services:service_id(name, price)
        `)
        .eq('professional_id', id)
        .gte('start_time', twelveMonthsAgo.toISOString())
        .order('start_time', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Filter appointments based on selected period
  const filteredAppointments = useMemo(() => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    if (historyPeriod === 'custom' && customStartDate && customEndDate) {
      startDate = customStartDate;
      endDate = customEndDate;
    } else {
      const days = parseInt(historyPeriod);
      startDate = subDays(now, days);
    }

    return allAppointments.filter(apt => {
      const aptDate = parseISO(apt.start_time);
      return aptDate >= startDate && aptDate <= endDate;
    });
  }, [allAppointments, historyPeriod, customStartDate, customEndDate]);

  // Calculate monthly stats for charts
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const sixMonthsAgo = subMonths(now, 5);
    const months = eachMonthOfInterval({ start: startOfMonth(sixMonthsAgo), end: endOfMonth(now) });
    
    return months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      
      const monthAppointments = allAppointments.filter(apt => {
        const aptDate = new Date(apt.start_time);
        return aptDate >= monthStart && aptDate <= monthEnd;
      });
      
      const completed = monthAppointments.filter(a => a.status === 'completed');
      const cancelled = monthAppointments.filter(a => a.status === 'cancelled' || a.status === 'missed');
      const revenue = completed
        .filter(a => a.payment_status === 'paid')
        .reduce((sum, a) => sum + (a.amount_paid || 0), 0);
      
      const commissionRate = professional?.is_commission_based ? (professional.commission_percentage || 0) / 100 : 0;
      const commission = revenue * commissionRate;
      
      return {
        month: format(month, 'MMM', { locale: ptBR }),
        fullMonth: format(month, 'MMMM yyyy', { locale: ptBR }),
        atendimentos: completed.length,
        cancelados: cancelled.length,
        faturamento: revenue,
        comissao: commission,
      };
    });
  }, [allAppointments, professional]);

  // Calculate stats
  const completedAppointments = allAppointments.filter(a => a.status === 'completed').length;
  const totalRevenue = allAppointments
    .filter(a => a.status === 'completed' && a.payment_status === 'paid')
    .reduce((sum, a) => sum + (a.amount_paid || 0), 0);
  const totalCommission = professional?.is_commission_based 
    ? totalRevenue * ((professional.commission_percentage || 0) / 100)
    : 0;
  const thisMonthAppointments = allAppointments.filter(a => {
    const date = new Date(a.start_time);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear() && a.status === 'completed';
  }).length;

  // Generate PDF Report
  const generatePDFReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Popup bloqueado. Permita popups para gerar o relatório.');
      return;
    }

    const recentAppointments = allAppointments.slice(0, 50);
    
    const appointmentsRows = recentAppointments.map(apt => `
      <tr>
        <td>${format(new Date(apt.start_time), 'dd/MM/yyyy HH:mm')}</td>
        <td>${escapeHtml((apt as any).clients?.name) || '-'}</td>
        <td>${escapeHtml((apt as any).services?.name) || '-'}</td>
        <td>${getStatusLabel(apt.status)}</td>
        <td style="text-align: right">${apt.amount_paid ? formatCurrency(apt.amount_paid) : '-'}</td>
      </tr>
    `).join('');

    const commissionRows = monthlyStats.map(stat => `
      <tr>
        <td>${stat.fullMonth}</td>
        <td style="text-align: center">${stat.atendimentos}</td>
        <td style="text-align: right">${formatCurrency(stat.faturamento)}</td>
        <td style="text-align: right">${formatCurrency(stat.comissao)}</td>
      </tr>
    `).join('');

    const permissionsHtml = professional?.app_role === 'admin' 
      ? '<p style="color: green; font-weight: bold;">✓ Acesso total (Administrador)</p>'
      : PERMISSIONS_CONFIG.map(perm => `
          <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee;">
            <span>${perm.label}</span>
            <span style="color: ${(professional?.permissions as any)?.[perm.key] ? 'green' : '#999'}">
              ${(professional?.permissions as any)?.[perm.key] ? '✓ Sim' : '✗ Não'}
            </span>
          </div>
        `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Relatório - ${escapeHtml(professional?.name)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; color: #333; font-size: 12px; }
          h1 { color: #1a1a1a; font-size: 20px; margin-bottom: 5px; }
          h2 { color: #444; font-size: 14px; margin-top: 20px; border-bottom: 2px solid #3B82F6; padding-bottom: 5px; }
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
          .header-info { text-align: right; color: #666; font-size: 11px; }
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
          .stat-card { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
          .stat-value { font-size: 18px; font-weight: bold; color: #3B82F6; }
          .stat-label { font-size: 10px; color: #666; margin-top: 5px; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
          th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background: #f1f5f9; font-weight: 600; }
          .section { margin-bottom: 25px; page-break-inside: avoid; }
          .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .info-item { padding: 8px 0; }
          .info-label { color: #666; font-size: 10px; }
          .info-value { font-weight: 500; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>${escapeHtml(professional?.name)}</h1>
            <p style="color: #666; margin: 0;">
              ${professional?.app_role === 'admin' ? 'Administrador' : 
                professional?.app_role === 'receptionist' ? 'Recepcionista' : 'Profissional'}
              ${professional?.specialties?.length ? ' • ' + escapeHtml(professional.specialties.join(', ')) : ''}
            </p>
          </div>
          <div class="header-info">
            <p style="margin: 0;">Relatório gerado em</p>
            <p style="margin: 0; font-weight: bold;">${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
          </div>
        </div>

        <div class="section">
          <h2>📊 Resumo Geral (Últimos 12 meses)</h2>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${completedAppointments}</div>
              <div class="stat-label">Atendimentos Concluídos</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${thisMonthAppointments}</div>
              <div class="stat-label">Este Mês</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${formatCurrency(totalRevenue)}</div>
              <div class="stat-label">Faturamento Total</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${formatCurrency(totalCommission)}</div>
              <div class="stat-label">Comissão Total</div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>👤 Informações do Profissional</h2>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Email</div>
              <div class="info-value">${escapeHtml(professional?.email) || '-'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Telefone</div>
              <div class="info-value">${escapeHtml(professional?.phone) || '-'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">CPF</div>
              <div class="info-value">${escapeHtml(professional?.cpf) || '-'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Nascimento</div>
              <div class="info-value">${professional?.birthdate ? format(new Date(professional.birthdate + 'T12:00:00'), 'dd/MM/yyyy') : '-'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Tipo de Pagamento</div>
              <div class="info-value">${professional?.is_commission_based ? `Comissionado (${professional.commission_percentage}%)` : 'Salário Fixo'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Status</div>
              <div class="info-value">${professional?.is_active ? 'Ativo' : 'Inativo'}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>💰 Relatório de Comissões (Últimos 6 meses)</h2>
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th style="text-align: center">Atendimentos</th>
                <th style="text-align: right">Faturamento</th>
                <th style="text-align: right">Comissão</th>
              </tr>
            </thead>
            <tbody>
              ${commissionRows}
              <tr style="font-weight: bold; background: #f1f5f9;">
                <td>TOTAL</td>
                <td style="text-align: center">${monthlyStats.reduce((s, m) => s + m.atendimentos, 0)}</td>
                <td style="text-align: right">${formatCurrency(monthlyStats.reduce((s, m) => s + m.faturamento, 0))}</td>
                <td style="text-align: right">${formatCurrency(monthlyStats.reduce((s, m) => s + m.comissao, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="section">
          <h2>📋 Histórico de Atendimentos (Últimos 50)</h2>
          <table>
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Cliente</th>
                <th>Serviço</th>
                <th>Status</th>
                <th style="text-align: right">Valor</th>
              </tr>
            </thead>
            <tbody>
              ${appointmentsRows || '<tr><td colspan="5" style="text-align: center; color: #999;">Nenhum atendimento</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="section">
          <h2>🔐 Permissões de Acesso</h2>
          ${permissionsHtml}
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    toast.success('Relatório gerado! Use Ctrl+P para salvar como PDF.');
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      completed: 'bg-green-500/10 text-green-600 border-green-500/20',
      scheduled: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      confirmed: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
      cancelled: 'bg-red-500/10 text-red-600 border-red-500/20',
      missed: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    };
    return colors[status] || 'bg-muted';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      completed: 'Concluído',
      scheduled: 'Agendado',
      confirmed: 'Confirmado',
      cancelled: 'Cancelado',
      missed: 'Faltou',
      rescheduled: 'Reagendado',
    };
    return labels[status] || status;
  };

  if (loadingProfessional) {
    return (
      <AppLayout title="Carregando...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  if (!professional) {
    return (
      <AppLayout title="Profissional não encontrado">
        <div className="text-center py-8">
          <p className="text-muted-foreground">Profissional não encontrado.</p>
          <Button variant="outline" onClick={() => navigate('/cadastros')} className="mt-4">
            Voltar
          </Button>
        </div>
      </AppLayout>
    );
  }

  const permissions = professional.permissions || {};
  const activePermissions = PERMISSIONS_CONFIG.filter(p => (permissions as any)[p.key]);

  return (
    <AppLayout 
      title={professional.name}
      subtitle="Detalhes do profissional"
    >
      <PageTransition>
        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="space-y-6 pr-4">
            {/* Back button and header */}
            <div className="flex items-center justify-between">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate('/cadastros')}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
              <div className="flex items-center gap-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={generatePDFReport}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Exportar PDF
                </Button>
                <Badge variant={professional.is_active ? 'default' : 'secondary'} className="text-xs">
                  {professional.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
            </div>

            {/* Professional header card */}
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-start gap-5">
                  <div 
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0 shadow-md"
                    style={{ backgroundColor: professional.agenda_color || '#3B82F6' }}
                  >
                    {professional.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <h2 className="text-xl font-semibold tracking-tight">{professional.name}</h2>
                    <div className="flex flex-wrap gap-2">
                      {professional.app_role && (
                        <Badge variant="outline" className="text-xs">
                          {professional.app_role === 'admin' ? 'Administrador' : 
                           professional.app_role === 'receptionist' ? 'Recepcionista' : 'Profissional'}
                        </Badge>
                      )}
                      {professional.specialties?.map((spec: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {spec}
                        </Badge>
                      ))}
                    </div>
                    {professional.bio && (
                      <p className="text-sm text-muted-foreground leading-relaxed">{professional.bio}</p>
                    )}
                  </div>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold text-primary">{completedAppointments}</p>
                    <p className="text-xs text-muted-foreground mt-1">Atendimentos</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold text-primary">{thisMonthAppointments}</p>
                    <p className="text-xs text-muted-foreground mt-1">Este mês</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold text-primary">{formatCurrency(totalRevenue)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Faturamento</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold text-primary">{formatCurrency(totalCommission)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Comissão</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5 h-10">
                <TabsTrigger value="info" className="text-xs gap-1.5">
                  <User className="h-3.5 w-3.5 hidden sm:block" />
                  Informações
                </TabsTrigger>
                <TabsTrigger value="performance" className="text-xs gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 hidden sm:block" />
                  Desempenho
                </TabsTrigger>
                <TabsTrigger value="commissions" className="text-xs gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 hidden sm:block" />
                  Comissões
                </TabsTrigger>
                <TabsTrigger value="appointments" className="text-xs gap-1.5">
                  <Calendar className="h-3.5 w-3.5 hidden sm:block" />
                  Histórico
                </TabsTrigger>
                <TabsTrigger value="permissions" className="text-xs gap-1.5">
                  <Shield className="h-3.5 w-3.5 hidden sm:block" />
                  Permissões
                </TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4 mt-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        Dados de Contato
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between py-2 border-b border-border/50">
                        <span className="text-xs text-muted-foreground">Email</span>
                        <span className="text-sm font-medium">{professional.email || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-border/50">
                        <span className="text-xs text-muted-foreground">Telefone</span>
                        <span className="text-sm font-medium">{professional.phone || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-border/50">
                        <span className="text-xs text-muted-foreground">CPF</span>
                        <span className="text-sm font-medium">{professional.cpf || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-muted-foreground">Nascimento</span>
                        <span className="text-sm font-medium">
                          {professional.birthdate ? format(new Date(professional.birthdate), 'dd/MM/yyyy') : '-'}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        Informações de Pagamento
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between py-2 border-b border-border/50">
                        <span className="text-xs text-muted-foreground">Tipo</span>
                        <span className="text-sm font-medium">
                          {professional.is_commission_based 
                            ? `Comissionado (${professional.commission_percentage || 0}%)`
                            : 'Salário Fixo'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-border/50">
                        <span className="text-xs text-muted-foreground">Cadastrado em</span>
                        <span className="text-sm font-medium">
                          {format(new Date(professional.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-muted-foreground">Cor na Agenda</span>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-4 h-4 rounded-full shadow-sm"
                            style={{ backgroundColor: professional.agenda_color || '#3B82F6' }}
                          />
                          <span className="text-sm font-medium">
                            {professional.agenda_color || '#3B82F6'}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="performance" className="space-y-4 mt-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        Evolução de Atendimentos
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Últimos 6 meses
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyStats}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="month" className="text-xs" tick={{ fontSize: 11 }} />
                            <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: 'hsl(var(--card))', 
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                                fontSize: '12px'
                              }}
                              formatter={(value: number, name: string) => [
                                value, 
                                name === 'atendimentos' ? 'Concluídos' : 'Cancelados'
                              ]}
                            />
                            <Legend 
                              formatter={(value) => value === 'atendimentos' ? 'Concluídos' : 'Cancelados'}
                              wrapperStyle={{ fontSize: '11px' }}
                            />
                            <Bar dataKey="atendimentos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="cancelados" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        Evolução do Faturamento
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Últimos 6 meses
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={monthlyStats}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="month" className="text-xs" tick={{ fontSize: 11 }} />
                            <YAxis 
                              className="text-xs" 
                              tick={{ fontSize: 11 }}
                              tickFormatter={(value) => `R$${(value/1000).toFixed(0)}k`}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: 'hsl(var(--card))', 
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                                fontSize: '12px'
                              }}
                              formatter={(value: number, name: string) => [
                                formatCurrency(value), 
                                name === 'faturamento' ? 'Faturamento' : 'Comissão'
                              ]}
                            />
                            <Legend 
                              formatter={(value) => value === 'faturamento' ? 'Faturamento' : 'Comissão'}
                              wrapperStyle={{ fontSize: '11px' }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="faturamento" 
                              stroke="hsl(var(--primary))" 
                              strokeWidth={2}
                              dot={{ fill: 'hsl(var(--primary))' }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="comissao" 
                              stroke="hsl(142 76% 36%)" 
                              strokeWidth={2}
                              dot={{ fill: 'hsl(142 76% 36%)' }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="commissions" className="mt-6">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Relatório de Comissões
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {professional.is_commission_based 
                        ? `Taxa de comissão: ${professional.commission_percentage}%`
                        : 'Profissional com salário fixo (sem comissão)'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs font-medium">Mês</TableHead>
                          <TableHead className="text-xs font-medium text-center">Atendimentos</TableHead>
                          <TableHead className="text-xs font-medium text-right">Faturamento</TableHead>
                          <TableHead className="text-xs font-medium text-right">Comissão</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthlyStats.map((stat, i) => (
                          <TableRow key={i} className="hover:bg-muted/30">
                            <TableCell className="text-xs capitalize py-3">{stat.fullMonth}</TableCell>
                            <TableCell className="text-xs text-center py-3">{stat.atendimentos}</TableCell>
                            <TableCell className="text-xs text-right py-3">{formatCurrency(stat.faturamento)}</TableCell>
                            <TableCell className="text-xs text-right py-3 font-medium text-green-600">
                              {formatCurrency(stat.comissao)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold bg-muted/50 hover:bg-muted/50">
                          <TableCell className="text-xs py-3">TOTAL</TableCell>
                          <TableCell className="text-xs text-center py-3">
                            {monthlyStats.reduce((s, m) => s + m.atendimentos, 0)}
                          </TableCell>
                          <TableCell className="text-xs text-right py-3">
                            {formatCurrency(monthlyStats.reduce((s, m) => s + m.faturamento, 0))}
                          </TableCell>
                          <TableCell className="text-xs text-right py-3 text-green-600">
                            {formatCurrency(monthlyStats.reduce((s, m) => s + m.comissao, 0))}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="appointments" className="mt-6">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          Histórico de Atendimentos
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {filteredAppointments.length} agendamentos no período
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select value={historyPeriod} onValueChange={(value) => {
                          setHistoryPeriod(value);
                          if (value === 'custom') {
                            setShowCustomDatePicker(true);
                          }
                        }}>
                          <SelectTrigger className="h-8 w-[180px] text-xs">
                            <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PERIOD_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        {historyPeriod === 'custom' && (
                          <Popover open={showCustomDatePicker} onOpenChange={setShowCustomDatePicker}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 text-xs gap-2">
                                <Calendar className="h-3.5 w-3.5" />
                                {customStartDate && customEndDate 
                                  ? `${format(customStartDate, 'dd/MM')} - ${format(customEndDate, 'dd/MM')}`
                                  : 'Selecionar'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-4" align="end">
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <label className="text-xs font-medium">Data inicial</label>
                                  <CalendarComponent
                                    mode="single"
                                    selected={customStartDate}
                                    onSelect={setCustomStartDate}
                                    locale={ptBR}
                                    className="rounded-md border"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-medium">Data final</label>
                                  <CalendarComponent
                                    mode="single"
                                    selected={customEndDate}
                                    onSelect={setCustomEndDate}
                                    locale={ptBR}
                                    className="rounded-md border"
                                  />
                                </div>
                                <Button 
                                  size="sm" 
                                  className="w-full"
                                  onClick={() => setShowCustomDatePicker(false)}
                                >
                                  Aplicar
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px]">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-xs font-medium">Data/Hora</TableHead>
                            <TableHead className="text-xs font-medium">Cliente</TableHead>
                            <TableHead className="text-xs font-medium">Serviço</TableHead>
                            <TableHead className="text-xs font-medium">Status</TableHead>
                            <TableHead className="text-xs font-medium text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredAppointments.slice(0, 100).map((apt: any) => (
                            <TableRow key={apt.id} className="hover:bg-muted/30">
                              <TableCell className="text-xs py-3">
                                {format(new Date(apt.start_time), 'dd/MM/yy HH:mm')}
                              </TableCell>
                              <TableCell className="text-xs py-3">
                                {apt.clients?.name || '-'}
                              </TableCell>
                              <TableCell className="text-xs py-3">
                                {apt.services?.name || '-'}
                              </TableCell>
                              <TableCell className="py-3">
                                <Badge variant="outline" className={`text-[10px] ${getStatusColor(apt.status)}`}>
                                  {getStatusLabel(apt.status)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-right py-3">
                                {apt.amount_paid ? formatCurrency(apt.amount_paid) : '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                          {filteredAppointments.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground py-12 text-sm">
                                Nenhum agendamento encontrado no período selecionado
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="permissions" className="mt-6">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      Permissões de Acesso
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {professional.app_role === 'admin' 
                        ? 'Administradores possuem acesso total ao sistema'
                        : `${activePermissions.length} permissões ativas`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {professional.app_role === 'admin' ? (
                      <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                        <p className="text-sm text-primary font-medium">
                          ✓ Acesso total a todas as funções do sistema
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {PERMISSION_CATEGORIES.map(category => {
                          const categoryPermissions = PERMISSIONS_CONFIG.filter(p => p.category === category.key);
                          const activeCategoryPerms = categoryPermissions.filter(p => (permissions as any)[p.key]);
                          
                          return (
                            <div key={category.key} className="space-y-2">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <span>{category.icon}</span>
                                <span>{category.label}</span>
                                <Badge variant="secondary" className="text-[10px] ml-auto">
                                  {activeCategoryPerms.length}/{categoryPermissions.length}
                                </Badge>
                              </div>
                              <div className="grid gap-2 pl-6">
                                {categoryPermissions.map(perm => (
                                  <div 
                                    key={perm.key}
                                    className={`flex items-center justify-between p-2 rounded text-sm ${
                                      (permissions as any)[perm.key]
                                        ? 'bg-green-500/10 border border-green-500/20' 
                                        : 'bg-muted/30 border border-transparent'
                                    }`}
                                  >
                                    <span className="text-xs">{perm.label}</span>
                                    <span className={`text-xs font-medium ${
                                      (permissions as any)[perm.key] ? 'text-green-600' : 'text-muted-foreground'
                                    }`}>
                                      {(permissions as any)[perm.key] ? '✓ Sim' : '✗ Não'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </PageTransition>
    </AppLayout>
  );
}
