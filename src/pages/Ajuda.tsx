import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, Users, Briefcase, DollarSign, Package, 
  BarChart3, Settings, FileText, Clock, CreditCard,
  Building2, UserCog, MessageSquare, HelpCircle
} from "lucide-react";

const Ajuda = () => {
  const modules = [
    {
      icon: <BarChart3 className="h-5 w-5" />,
      title: "Dashboard",
      description: "Visão geral do seu negócio",
      features: [
        { name: "Vendas do Dia", description: "Total de vendas realizadas hoje" },
        { name: "Vendas do Mês", description: "Total de vendas do mês atual" },
        { name: "Vendas do Ano", description: "Total acumulado no ano" },
        { name: "Ticket Médio", description: "Valor médio por atendimento" },
        { name: "Gráfico de Vendas", description: "Comparativo mensal de vendas e novos clientes" },
        { name: "Fluxo de Caixa", description: "Entradas e saídas do dia" },
        { name: "Top Serviços", description: "Serviços mais realizados" },
        { name: "Filtro por Profissional", description: "Filtre os dados por profissional específico" },
      ]
    },
    {
      icon: <Calendar className="h-5 w-5" />,
      title: "Agenda",
      description: "Gerenciamento de agendamentos",
      features: [
        { name: "Novo Agendamento", description: "Criar um novo agendamento selecionando cliente, serviço, profissional, data e horário" },
        { name: "Visualização por Dia", description: "Ver todos os agendamentos do dia selecionado" },
        { name: "Status do Agendamento", description: "Agendado, Confirmado, Concluído, Cancelado, Faltou, Reagendado" },
        { name: "Filtro por Profissional", description: "Ver agenda de um profissional específico" },
        { name: "Pagamento", description: "Registrar pagamento do agendamento com método de pagamento" },
        { name: "Arrastar e Soltar", description: "Mover agendamentos na agenda (se habilitado)" },
        { name: "Ausências", description: "Registrar férias, folgas ou ausências dos profissionais" },
      ]
    },
    {
      icon: <Users className="h-5 w-5" />,
      title: "Clientes",
      description: "Cadastro e gestão de clientes",
      features: [
        { name: "Nome", description: "Nome completo do cliente (obrigatório)" },
        { name: "Telefone", description: "Número de WhatsApp para contato (obrigatório)" },
        { name: "CPF", description: "Documento do cliente (opcional)" },
        { name: "E-mail", description: "E-mail para contato (opcional)" },
        { name: "Data de Nascimento", description: "Para mensagens de aniversário" },
        { name: "Origem", description: "Como o cliente conheceu seu negócio" },
        { name: "Profissional Responsável", description: "Vincular cliente a um profissional" },
        { name: "Informações Complementares", description: "Observações sobre o cliente" },
        { name: "Saldo de Crédito", description: "Créditos do cliente para usar em serviços" },
        { name: "Fotos de Tratamento", description: "Antes, durante e depois dos tratamentos" },
        { name: "Documentos", description: "Anamnese, contratos e outros documentos" },
        { name: "Orçamentos", description: "Criar e enviar orçamentos para o cliente" },
      ]
    },
    {
      icon: <Briefcase className="h-5 w-5" />,
      title: "Serviços",
      description: "Catálogo de serviços e pacotes",
      features: [
        { name: "Nome do Serviço", description: "Nome do procedimento/serviço" },
        { name: "Categoria", description: "Agrupamento dos serviços (ex: Facial, Corporal)" },
        { name: "Preço", description: "Valor cobrado pelo serviço" },
        { name: "Duração", description: "Tempo estimado do procedimento em minutos" },
        { name: "Dias de Retorno", description: "Intervalo recomendado para novo atendimento" },
        { name: "Profissional Padrão", description: "Profissional que realiza este serviço" },
        { name: "Sala Padrão", description: "Sala onde o serviço é realizado" },
        { name: "Pacotes", description: "Conjunto de sessões com preço especial" },
        { name: "Modelos de Pacotes", description: "Templates pré-configurados para criar pacotes" },
        { name: "Produtos Utilizados", description: "Vincular produtos gastos no serviço" },
      ]
    },
    {
      icon: <DollarSign className="h-5 w-5" />,
      title: "Caixa",
      description: "Controle de caixa diário",
      features: [
        { name: "Abrir Caixa", description: "Iniciar o dia informando o saldo inicial" },
        { name: "Fechar Caixa", description: "Finalizar o dia com conferência dos valores" },
        { name: "Entradas", description: "Pagamentos recebidos de clientes" },
        { name: "Saídas", description: "Despesas e retiradas do caixa" },
        { name: "Sangria", description: "Retirada de dinheiro do caixa para o banco" },
        { name: "Suprimento", description: "Entrada de dinheiro no caixa" },
        { name: "Depósitos Bancários", description: "Envio de valores para contas bancárias" },
        { name: "Histórico", description: "Visualizar caixas anteriores" },
        { name: "Comissões", description: "Relatório de comissões dos profissionais" },
      ]
    },
    {
      icon: <CreditCard className="h-5 w-5" />,
      title: "Financeiro",
      description: "Contas a pagar e receber",
      features: [
        { name: "Contas a Pagar", description: "Despesas e fornecedores a pagar" },
        { name: "Contas a Receber", description: "Valores a receber de clientes" },
        { name: "Categorias", description: "Classificação das entradas/saídas" },
        { name: "Vencimento", description: "Data de vencimento da conta" },
        { name: "Status", description: "Pendente, Pago, Vencido" },
        { name: "Parcelamento", description: "Dividir valor em parcelas" },
        { name: "Recorrência", description: "Contas que se repetem (aluguel, etc)" },
        { name: "Banco", description: "Conta bancária vinculada" },
      ]
    },
    {
      icon: <Package className="h-5 w-5" />,
      title: "Produtos",
      description: "Estoque e fornecedores",
      features: [
        { name: "Nome do Produto", description: "Nome do produto/insumo" },
        { name: "Marca", description: "Fabricante do produto" },
        { name: "Categoria", description: "Tipo do produto" },
        { name: "Tipo", description: "Sólido, Líquido, Gel, etc" },
        { name: "Unidade", description: "Un, mL, g, etc" },
        { name: "Quantidade", description: "Quantidade em estoque" },
        { name: "Preço de Compra", description: "Valor pago pelo produto" },
        { name: "Fornecedor", description: "Quem fornece o produto" },
        { name: "Data de Validade", description: "Quando o produto vence" },
        { name: "Alerta de Estoque", description: "Aviso quando estoque está baixo" },
        { name: "Duração Média", description: "Quanto tempo o produto dura em uso" },
      ]
    },
    {
      icon: <Building2 className="h-5 w-5" />,
      title: "Cadastros",
      description: "Configurações básicas do sistema",
      features: [
        { name: "Métodos de Pagamento", description: "Dinheiro, PIX, Cartões, etc" },
        { name: "Categorias Financeiras", description: "Classificação de despesas/receitas" },
        { name: "Bancos", description: "Contas bancárias da empresa" },
        { name: "Bandeiras de Cartão", description: "Visa, Master, Elo e taxas" },
        { name: "Equipamentos", description: "Aparelhos utilizados nos serviços" },
      ]
    },
    {
      icon: <UserCog className="h-5 w-5" />,
      title: "Configurações",
      description: "Ajustes do sistema",
      features: [
        { name: "Profissionais", description: "Cadastro de profissionais da equipe" },
        { name: "Salas", description: "Ambientes de atendimento" },
        { name: "Horário de Funcionamento", description: "Abertura e fechamento" },
        { name: "Intervalo de Slots", description: "Tempo mínimo entre agendamentos" },
        { name: "Dias de Trabalho", description: "Sábados e domingos" },
        { name: "Drag and Drop", description: "Permitir arrastar agendamentos" },
        { name: "Templates de Documentos", description: "Modelos de anamnese e contratos" },
        { name: "Mensagens WhatsApp", description: "Templates de lembretes e aniversário" },
        { name: "Gestão de Usuários", description: "Controle de acesso (Admin, Recepção, Profissional)" },
      ]
    },
    {
      icon: <BarChart3 className="h-5 w-5" />,
      title: "Relatórios",
      description: "Análises e relatórios",
      features: [
        { name: "Vendas por Período", description: "Total de vendas em um intervalo" },
        { name: "Serviços Realizados", description: "Quantidade por tipo de serviço" },
        { name: "Clientes Ativos", description: "Clientes com agendamentos recentes" },
        { name: "Comissões", description: "Valores devidos aos profissionais" },
        { name: "Exportar CSV", description: "Baixar dados em planilha" },
      ]
    },
    {
      icon: <FileText className="h-5 w-5" />,
      title: "Auditoria",
      description: "Histórico de alterações",
      features: [
        { name: "Log de Ações", description: "Registro de todas as alterações no sistema" },
        { name: "Usuário", description: "Quem realizou a ação" },
        { name: "Data/Hora", description: "Quando a ação foi realizada" },
        { name: "Dados Anteriores", description: "Valores antes da alteração" },
        { name: "Dados Novos", description: "Valores após a alteração" },
        { name: "Filtros", description: "Filtrar por tabela, ação ou período" },
      ]
    },
  ];

  const statusList = [
    { status: "scheduled", label: "Agendado", color: "bg-blue-500", description: "Agendamento criado, aguardando confirmação" },
    { status: "confirmed", label: "Confirmado", color: "bg-green-500", description: "Cliente confirmou presença" },
    { status: "completed", label: "Concluído", color: "bg-purple-500", description: "Atendimento realizado com sucesso" },
    { status: "cancelled", label: "Cancelado", color: "bg-red-500", description: "Agendamento foi cancelado" },
    { status: "missed", label: "Faltou", color: "bg-orange-500", description: "Cliente não compareceu" },
    { status: "rescheduled", label: "Reagendado", color: "bg-yellow-500", description: "Agendamento foi remarcado" },
  ];

  const roles = [
    { role: "admin", label: "Administrador", description: "Acesso total ao sistema. Pode criar usuários, ver relatórios financeiros, deletar registros e configurar o sistema." },
    { role: "receptionist", label: "Recepcionista", description: "Pode gerenciar agenda, clientes, caixa e criar agendamentos. Não pode deletar registros ou acessar configurações avançadas." },
    { role: "professional", label: "Profissional", description: "Acesso limitado à própria agenda e clientes vinculados. Pode visualizar seus agendamentos e marcar como concluído." },
  ];

  return (
    <AppLayout title="Central de Ajuda" subtitle="Guia completo do sistema">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Central de Ajuda</h1>
          <p className="text-muted-foreground mt-2">
            Guia completo de como usar cada funcionalidade do sistema
          </p>
        </div>

        <Tabs defaultValue="modules" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="modules">Módulos</TabsTrigger>
            <TabsTrigger value="status">Status</TabsTrigger>
            <TabsTrigger value="roles">Permissões</TabsTrigger>
            <TabsTrigger value="tips">Dicas</TabsTrigger>
          </TabsList>

          <TabsContent value="modules" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {modules.map((module, index) => (
                <Card key={index}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {module.icon}
                      {module.title}
                    </CardTitle>
                    <CardDescription>{module.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Funcionalidade</TableHead>
                          <TableHead>Descrição</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {module.features.map((feature, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{feature.name}</TableCell>
                            <TableCell className="text-muted-foreground">{feature.description}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="status" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Status dos Agendamentos
                </CardTitle>
                <CardDescription>
                  Entenda cada status do ciclo de vida de um agendamento
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Cor</TableHead>
                      <TableHead>Descrição</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statusList.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.label}</TableCell>
                        <TableCell>
                          <div className={`w-4 h-4 rounded-full ${item.color}`} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status de Pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Descrição</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell><Badge variant="outline">Pendente</Badge></TableCell>
                      <TableCell>Pagamento ainda não foi realizado</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="default" className="bg-yellow-500">Parcial</Badge></TableCell>
                      <TableCell>Parte do valor foi paga</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Badge variant="default" className="bg-green-500">Pago</Badge></TableCell>
                      <TableCell>Valor total foi recebido</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="roles" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCog className="h-5 w-5" />
                  Níveis de Acesso
                </CardTitle>
                <CardDescription>
                  Cada usuário possui um nível de permissão que define o que pode acessar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nível</TableHead>
                      <TableHead>Descrição</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Badge variant={item.role === 'admin' ? 'destructive' : item.role === 'receptionist' ? 'default' : 'secondary'}>
                            {item.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Permissões por Função</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ação</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Recepção</TableHead>
                      <TableHead>Profissional</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>Ver Dashboard</TableCell>
                      <TableCell>✅</TableCell>
                      <TableCell>✅</TableCell>
                      <TableCell>✅ (próprios)</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Criar Agendamentos</TableCell>
                      <TableCell>✅</TableCell>
                      <TableCell>✅</TableCell>
                      <TableCell>✅</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Ver Todos Clientes</TableCell>
                      <TableCell>✅</TableCell>
                      <TableCell>✅</TableCell>
                      <TableCell>❌ (só vinculados)</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Deletar Registros</TableCell>
                      <TableCell>✅</TableCell>
                      <TableCell>❌</TableCell>
                      <TableCell>❌</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Configurações</TableCell>
                      <TableCell>✅</TableCell>
                      <TableCell>❌</TableCell>
                      <TableCell>❌</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Gestão de Usuários</TableCell>
                      <TableCell>✅</TableCell>
                      <TableCell>❌</TableCell>
                      <TableCell>❌</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Ver Auditoria</TableCell>
                      <TableCell>✅</TableCell>
                      <TableCell>❌</TableCell>
                      <TableCell>❌</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Caixa/Financeiro</TableCell>
                      <TableCell>✅</TableCell>
                      <TableCell>✅</TableCell>
                      <TableCell>❌</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tips" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HelpCircle className="h-5 w-5" />
                    Dicas de Uso
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-semibold">📅 Agendamentos</h4>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      <li>Clique em um horário vazio para criar agendamento rápido</li>
                      <li>Use filtros para ver agenda de um profissional específico</li>
                      <li>Marque como "Confirmado" após contato com cliente</li>
                      <li>Registre o pagamento ao concluir o atendimento</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold">👤 Clientes</h4>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      <li>Preencha a data de nascimento para lembretes automáticos</li>
                      <li>Use as fotos para documentar evolução do tratamento</li>
                      <li>Crie orçamentos e envie por WhatsApp</li>
                      <li>Vincule um profissional responsável para controle</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold">💰 Financeiro</h4>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      <li>Sempre abra o caixa no início do dia</li>
                      <li>Feche o caixa no final conferindo os valores</li>
                      <li>Use categorias para organizar despesas</li>
                      <li>Configure taxas de cartão para cálculo correto</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    WhatsApp
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-semibold">📱 Variáveis Disponíveis</h4>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      <li><code className="bg-muted px-1 rounded">{"{nome}"}</code> - Nome do cliente</li>
                      <li><code className="bg-muted px-1 rounded">{"{servico}"}</code> - Nome do serviço</li>
                      <li><code className="bg-muted px-1 rounded">{"{data}"}</code> - Data do agendamento</li>
                      <li><code className="bg-muted px-1 rounded">{"{hora}"}</code> - Horário do agendamento</li>
                      <li><code className="bg-muted px-1 rounded">{"{profissional}"}</code> - Nome do profissional</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold">⏰ Lembretes</h4>
                    <p className="text-sm text-muted-foreground">
                      Configure quantas horas antes do agendamento o cliente receberá o lembrete. 
                      Recomendamos 24h para dar tempo de confirmar ou reagendar.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>🚀 Primeiros Passos</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li><strong>Configure os profissionais</strong> - Adicione sua equipe em Configurações → Profissionais</li>
                    <li><strong>Cadastre os serviços</strong> - Crie seus procedimentos com preços e duração</li>
                    <li><strong>Configure métodos de pagamento</strong> - Em Cadastros, adicione as formas de pagamento aceitas</li>
                    <li><strong>Importe ou cadastre clientes</strong> - Adicione sua base de clientes</li>
                    <li><strong>Configure o WhatsApp</strong> - Em Configurações, personalize as mensagens automáticas</li>
                    <li><strong>Comece a agendar!</strong> - Use a Agenda para criar os primeiros atendimentos</li>
                  </ol>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Ajuda;
