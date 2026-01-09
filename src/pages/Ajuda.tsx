import { AppLayout } from "@/components/layout/AppLayout";
import { PageTransition } from "@/components/layout/PageTransition";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { 
  Calendar, Users, Briefcase, DollarSign, Package, 
  BarChart3, Settings, FileText, Clock, CreditCard,
  Building2, UserCog, Check, X
} from "lucide-react";

const Ajuda = () => {
  const [activeTab, setActiveTab] = useLocalStorage('ajuda-tab', 'modules');

  const modules = [
    {
      icon: <BarChart3 className="h-4 w-4" />,
      title: "Dashboard",
      description: "Visão geral do negócio",
      features: [
        { name: "Vendas do Dia", description: "Total de vendas realizadas hoje" },
        { name: "Vendas do Mês", description: "Total de vendas do mês atual" },
        { name: "Ticket Médio", description: "Valor médio por atendimento" },
        { name: "Fluxo de Caixa", description: "Entradas e saídas do dia" },
      ]
    },
    {
      icon: <Calendar className="h-4 w-4" />,
      title: "Agenda",
      description: "Gerenciamento de agendamentos",
      features: [
        { name: "Novo Agendamento", description: "Criar agendamento com cliente, serviço, profissional" },
        { name: "Visualização por Dia", description: "Ver todos os agendamentos do dia" },
        { name: "Status", description: "Agendado, Confirmado, Concluído, Cancelado" },
        { name: "Arrastar e Soltar", description: "Mover agendamentos na agenda" },
      ]
    },
    {
      icon: <Users className="h-4 w-4" />,
      title: "Clientes",
      description: "Cadastro e gestão de clientes",
      features: [
        { name: "Dados Básicos", description: "Nome, telefone, CPF, email" },
        { name: "Saldo de Crédito", description: "Créditos para usar em serviços" },
        { name: "Fotos de Tratamento", description: "Antes, durante e depois" },
        { name: "Documentos", description: "Anamnese, contratos" },
      ]
    },
    {
      icon: <Briefcase className="h-4 w-4" />,
      title: "Serviços",
      description: "Catálogo de serviços e pacotes",
      features: [
        { name: "Serviços", description: "Nome, categoria, preço, duração" },
        { name: "Pacotes", description: "Conjunto de sessões com preço especial" },
        { name: "Profissional Padrão", description: "Profissional que realiza o serviço" },
        { name: "Produtos Utilizados", description: "Vincular produtos gastos" },
      ]
    },
    {
      icon: <DollarSign className="h-4 w-4" />,
      title: "Caixa",
      description: "Controle de caixa diário",
      features: [
        { name: "Abrir/Fechar Caixa", description: "Iniciar e finalizar o dia" },
        { name: "Entradas/Saídas", description: "Pagamentos e despesas" },
        { name: "Sangria/Suprimento", description: "Movimentação de valores" },
        { name: "Comissões", description: "Relatório de comissões" },
      ]
    },
    {
      icon: <Package className="h-4 w-4" />,
      title: "Produtos",
      description: "Estoque e fornecedores",
      features: [
        { name: "Cadastro", description: "Nome, marca, categoria, unidade" },
        { name: "Estoque", description: "Quantidade, preço de compra" },
        { name: "Alertas", description: "Aviso de estoque baixo" },
        { name: "Fornecedores", description: "Gestão de fornecedores" },
      ]
    },
  ];

  const statusList = [
    { status: "scheduled", label: "Agendado", color: "bg-blue-500", description: "Aguardando confirmação" },
    { status: "confirmed", label: "Confirmado", color: "bg-green-500", description: "Cliente confirmou presença" },
    { status: "completed", label: "Concluído", color: "bg-purple-500", description: "Atendimento realizado" },
    { status: "cancelled", label: "Cancelado", color: "bg-red-500", description: "Agendamento cancelado" },
    { status: "missed", label: "Faltou", color: "bg-orange-500", description: "Cliente não compareceu" },
    { status: "rescheduled", label: "Reagendado", color: "bg-yellow-500", description: "Foi remarcado" },
  ];

  const roles = [
    { role: "admin", label: "Administrador", description: "Acesso total ao sistema" },
    { role: "receptionist", label: "Recepcionista", description: "Gerencia agenda, clientes e caixa" },
    { role: "professional", label: "Profissional", description: "Acesso limitado à própria agenda" },
  ];

  const permissions = [
    { action: "Ver Dashboard", admin: true, receptionist: true, professional: false },
    { action: "Gerenciar Agenda", admin: true, receptionist: true, professional: true },
    { action: "Criar Clientes", admin: true, receptionist: true, professional: false },
    { action: "Abrir/Fechar Caixa", admin: true, receptionist: false, professional: false },
    { action: "Ver Relatórios Financeiros", admin: true, receptionist: false, professional: false },
    { action: "Gerenciar Usuários", admin: true, receptionist: false, professional: false },
    { action: "Deletar Registros", admin: true, receptionist: false, professional: false },
  ];

  return (
    <AppLayout title="Central de Ajuda" subtitle="Guia completo do sistema">
      <PageTransition>
        <div className="space-y-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-4 h-9">
              <TabsTrigger value="modules" className="text-xs">Módulos</TabsTrigger>
              <TabsTrigger value="status" className="text-xs">Status</TabsTrigger>
              <TabsTrigger value="roles" className="text-xs">Permissões</TabsTrigger>
              <TabsTrigger value="tips" className="text-xs">Dicas</TabsTrigger>
            </TabsList>

            <TabsContent value="modules" className="space-y-4 page-enter">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {modules.map((module, index) => (
                  <Card key={index} className="card-hover">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm font-medium">
                        <div className="rounded-lg bg-primary/10 p-1.5">
                          {module.icon}
                        </div>
                        {module.title}
                      </CardTitle>
                      <CardDescription className="text-xs">{module.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-1.5">
                        {module.features.map((feature, idx) => (
                          <div key={idx} className="flex justify-between text-xs">
                            <span className="font-medium">{feature.name}</span>
                            <span className="text-muted-foreground text-right max-w-[50%] truncate">{feature.description}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="status" className="space-y-4 page-enter">
              <Card className="card-hover">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Status dos Agendamentos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {statusList.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                        <div className={`w-3 h-3 rounded-full ${item.color}`} />
                        <div>
                          <p className="text-xs font-medium">{item.label}</p>
                          <p className="text-[10px] text-muted-foreground">{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="card-hover">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Status de Pagamento</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                      <Badge variant="outline" className="text-[10px]">Pendente</Badge>
                      <span className="text-[10px] text-muted-foreground">Não pago</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                      <Badge className="bg-yellow-500 text-[10px]">Parcial</Badge>
                      <span className="text-[10px] text-muted-foreground">Parte paga</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                      <Badge className="bg-green-500 text-[10px]">Pago</Badge>
                      <span className="text-[10px] text-muted-foreground">Total recebido</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="roles" className="space-y-4 page-enter">
              <Card className="card-hover">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <UserCog className="h-4 w-4" />
                    Níveis de Acesso
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    {roles.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                        <Badge variant={item.role === 'admin' ? 'destructive' : item.role === 'receptionist' ? 'default' : 'secondary'} className="text-[10px]">
                          {item.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{item.description}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="card-hover">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Permissões por Função</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[200px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Ação</TableHead>
                          <TableHead className="text-xs text-center">Admin</TableHead>
                          <TableHead className="text-xs text-center">Recepção</TableHead>
                          <TableHead className="text-xs text-center">Prof.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {permissions.map((perm, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs">{perm.action}</TableCell>
                            <TableCell className="text-center">
                              {perm.admin ? <Check className="h-3 w-3 text-green-500 mx-auto" /> : <X className="h-3 w-3 text-red-500 mx-auto" />}
                            </TableCell>
                            <TableCell className="text-center">
                              {perm.receptionist ? <Check className="h-3 w-3 text-green-500 mx-auto" /> : <X className="h-3 w-3 text-red-500 mx-auto" />}
                            </TableCell>
                            <TableCell className="text-center">
                              {perm.professional ? <Check className="h-3 w-3 text-green-500 mx-auto" /> : <X className="h-3 w-3 text-red-500 mx-auto" />}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tips" className="space-y-4 page-enter">
              <div className="grid gap-3 md:grid-cols-2">
                <Card className="card-hover">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">💡 Dicas Rápidas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">• Use atalhos de teclado para navegar mais rápido</p>
                    <p className="text-xs text-muted-foreground">• Configure lembretes automáticos para reduzir faltas</p>
                    <p className="text-xs text-muted-foreground">• Mantenha o estoque atualizado para evitar surpresas</p>
                    <p className="text-xs text-muted-foreground">• Revise o caixa diariamente para manter controle</p>
                  </CardContent>
                </Card>

                <Card className="card-hover">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">🚀 Boas Práticas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">• Confirme agendamentos com antecedência</p>
                    <p className="text-xs text-muted-foreground">• Registre observações importantes nos clientes</p>
                    <p className="text-xs text-muted-foreground">• Acompanhe os relatórios semanalmente</p>
                    <p className="text-xs text-muted-foreground">• Mantenha backup das informações importantes</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </PageTransition>
    </AppLayout>
  );
};

export default Ajuda;
