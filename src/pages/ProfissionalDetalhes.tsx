import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  DollarSign, 
  Clock,
  Edit2,
  Shield,
  Briefcase
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageTransition } from '@/components/layout/PageTransition';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

export default function ProfissionalDetalhes() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('info');

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

  // Fetch appointments for this professional
  const { data: appointments = [] } = useQuery({
    queryKey: ['professional-appointments', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          clients:client_id(name, phone),
          services:service_id(name, price)
        `)
        .eq('professional_id', id)
        .order('start_time', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Calculate stats
  const completedAppointments = appointments.filter(a => a.status === 'completed').length;
  const totalRevenue = appointments
    .filter(a => a.status === 'completed' && a.payment_status === 'paid')
    .reduce((sum, a) => sum + (a.amount_paid || 0), 0);
  const thisMonthAppointments = appointments.filter(a => {
    const date = new Date(a.start_time);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).length;

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
  const activePermissions = PERMISSIONS_CONFIG.filter(p => permissions[p.key]);

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

  return (
    <AppLayout 
      title={professional.name}
      subtitle="Detalhes do profissional"
    >
      <PageTransition>
        <div className="space-y-4">
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
            <Badge variant={professional.is_active ? 'default' : 'secondary'}>
              {professional.is_active ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>

          {/* Professional header card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0"
                  style={{ backgroundColor: professional.agenda_color || '#3B82F6' }}
                >
                  {professional.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold">{professional.name}</h2>
                  <div className="flex flex-wrap gap-2 mt-2">
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
                    <p className="text-sm text-muted-foreground mt-2">{professional.bio}</p>
                  )}
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-primary">{completedAppointments}</p>
                  <p className="text-xs text-muted-foreground">Atendimentos</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-primary">{thisMonthAppointments}</p>
                  <p className="text-xs text-muted-foreground">Este mês</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-primary">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalRevenue)}
                  </p>
                  <p className="text-xs text-muted-foreground">Faturamento</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-primary">
                    {professional.is_commission_based ? `${professional.commission_percentage || 0}%` : 'Fixo'}
                  </p>
                  <p className="text-xs text-muted-foreground">Comissão</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 h-9">
              <TabsTrigger value="info" className="text-xs">Informações</TabsTrigger>
              <TabsTrigger value="appointments" className="text-xs">Histórico</TabsTrigger>
              <TabsTrigger value="permissions" className="text-xs">Permissões</TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Dados de Contato</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {professional.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{professional.email}</span>
                    </div>
                  )}
                  {professional.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{professional.phone}</span>
                    </div>
                  )}
                  {professional.cpf && (
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">CPF: {professional.cpf}</span>
                    </div>
                  )}
                  {professional.birthdate && (
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        Nascimento: {format(new Date(professional.birthdate), 'dd/MM/yyyy')}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Informações de Pagamento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {professional.is_commission_based 
                        ? `Comissionado - ${professional.commission_percentage || 0}%`
                        : 'Salário Fixo'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      Cadastrado em: {format(new Date(professional.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appointments" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Histórico de Atendimentos</CardTitle>
                  <CardDescription className="text-xs">
                    Últimos 50 agendamentos
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Data/Hora</TableHead>
                          <TableHead className="text-xs">Cliente</TableHead>
                          <TableHead className="text-xs">Serviço</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {appointments.map((apt: any) => (
                          <TableRow key={apt.id}>
                            <TableCell className="text-xs">
                              {format(new Date(apt.start_time), 'dd/MM/yy HH:mm')}
                            </TableCell>
                            <TableCell className="text-xs">
                              {apt.clients?.name || '-'}
                            </TableCell>
                            <TableCell className="text-xs">
                              {apt.services?.name || '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] ${getStatusColor(apt.status)}`}>
                                {getStatusLabel(apt.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {apt.amount_paid 
                                ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(apt.amount_paid)
                                : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                        {appointments.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-sm">
                              Nenhum agendamento encontrado
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="permissions" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4" />
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
                    <div className="grid gap-2">
                      {PERMISSIONS_CONFIG.map(perm => (
                        <div 
                          key={perm.key}
                          className={`flex items-center justify-between p-2 rounded text-sm ${
                            permissions[perm.key] 
                              ? 'bg-green-500/10 border border-green-500/20' 
                              : 'bg-muted/30'
                          }`}
                        >
                          <span className={permissions[perm.key] ? 'text-green-700' : 'text-muted-foreground'}>
                            {perm.label}
                          </span>
                          <Badge variant={permissions[perm.key] ? 'default' : 'secondary'} className="text-[10px]">
                            {permissions[perm.key] ? 'Sim' : 'Não'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </PageTransition>
    </AppLayout>
  );
}
