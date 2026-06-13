import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageTransition } from "@/components/layout/PageTransition";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Calendar, Users, Briefcase, DollarSign, Package, 
  BarChart3, Settings, FileText, Clock, CreditCard,
  Building2, UserCog, Check, X, ChevronDown, ChevronRight,
  HelpCircle, Bell, Shield, ClipboardList, Sparkles, Rocket,
  MessageCircle, Wrench, ShieldCheck
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CHANGELOG, CURRENT_CHANGELOG } from "@/lib/changelog";
import { APP_VERSION_LABEL, APP_VERSION } from "@/lib/version";


const Ajuda = () => {
  const [activeTab, setActiveTab] = useLocalStorage('ajuda-tab', 'modules');
  const [openModules, setOpenModules] = useState<string[]>([]);

  const toggleModule = (title: string) => {
    setOpenModules(prev => 
      prev.includes(title) 
        ? prev.filter(m => m !== title) 
        : [...prev, title]
    );
  };

  const modules = [
    {
      icon: <BarChart3 className="h-4 w-4" />,
      title: "Dashboard",
      description: "Visão geral do negócio",
      features: [
        { name: "Vendas do Dia", description: "Exibe o total de vendas realizadas no dia atual, incluindo serviços avulsos e pacotes vendidos." },
        { name: "Vendas do Mês", description: "Mostra o acumulado de vendas do mês corrente com comparativo ao mês anterior." },
        { name: "Ticket Médio", description: "Calcula automaticamente o valor médio por atendimento, ajudando a entender o comportamento de compra dos clientes." },
        { name: "Fluxo de Caixa", description: "Apresenta entradas e saídas do dia, permitindo visualizar o saldo disponível em tempo real." },
        { name: "Gráficos", description: "Gráficos interativos mostrando vendas por período, distribuição de serviços e performance por profissional." },
      ]
    },
    {
      icon: <Calendar className="h-4 w-4" />,
      title: "Agenda",
      description: "Gerenciamento de agendamentos",
      features: [
        { name: "Novo Agendamento", description: "Crie agendamentos selecionando cliente, serviço, profissional, data e horário. O sistema verifica automaticamente conflitos de horários." },
        { name: "Visualização por Dia", description: "Veja todos os agendamentos do dia organizados por horário e profissional. Clique em um slot vazio para criar novo agendamento." },
        { name: "Status dos Agendamentos", description: "Cada agendamento pode ter status: Agendado (azul), Confirmado (verde), Concluído (roxo), Cancelado (vermelho), Faltou (laranja) ou Reagendado (amarelo)." },
        { name: "Arrastar e Soltar", description: "Mova agendamentos arrastando-os para outros horários ou dias. Esta função pode ser ativada/desativada nas configurações." },
        { name: "Ausências de Profissionais", description: "Registre férias, folgas e ausências dos profissionais. O sistema bloqueia automaticamente os horários deles na agenda." },
      ]
    },
    {
      icon: <Users className="h-4 w-4" />,
      title: "Clientes",
      description: "Cadastro e gestão de clientes",
      features: [
        { name: "Dados Básicos", description: "Cadastre nome, telefone, CPF, email, data de nascimento e informações complementares. O sistema valida CPF automaticamente." },
        { name: "Saldo de Crédito", description: "Cada cliente pode ter um saldo de créditos para usar em serviços futuros. Ideal para gift cards ou pagamentos antecipados." },
        { name: "Fotos de Tratamento", description: "Registre o progresso dos tratamentos com fotos de antes, durante e depois. Ótimo para acompanhamento de resultados." },
        { name: "Documentos", description: "Armazene anamnese, contratos, termos de consentimento e outros documentos importantes vinculados ao cliente." },
        { name: "Histórico", description: "Veja todo o histórico de atendimentos, pagamentos e evolução do cliente em um só lugar." },
      ]
    },
    {
      icon: <Briefcase className="h-4 w-4" />,
      title: "Serviços",
      description: "Catálogo de serviços e pacotes",
      features: [
        { name: "Cadastro de Serviços", description: "Defina nome, categoria, preço, duração e descrição. Vincule um profissional padrão e sala se necessário." },
        { name: "Pacotes de Sessões", description: "Crie pacotes com múltiplas sessões e preço especial. O sistema controla automaticamente quantas sessões foram utilizadas." },
        { name: "Profissional Padrão", description: "Ao vincular um profissional padrão ao serviço, ele é selecionado automaticamente ao criar um agendamento deste serviço." },
        { name: "Produtos Utilizados", description: "Vincule quais produtos são gastos em cada serviço e a quantidade por atendimento. O estoque é atualizado automaticamente." },
        { name: "Retornos", description: "Configure dias para retorno automático. O sistema gera lembretes quando o cliente precisa voltar." },
      ]
    },
    {
      icon: <DollarSign className="h-4 w-4" />,
      title: "Caixa",
      description: "Controle de caixa diário",
      features: [
        { name: "Abrir Caixa", description: "Inicie o dia informando o valor inicial em caixa. A partir deste momento todas as movimentações são registradas." },
        { name: "Fechar Caixa", description: "Ao final do dia, confira os valores recebidos por forma de pagamento e registre o fechamento. O sistema calcula diferenças automaticamente." },
        { name: "Vendas e Recebimentos", description: "Registre vendas de serviços, pacotes e produtos. Aceite múltiplas formas de pagamento na mesma venda." },
        { name: "Sangria e Suprimento", description: "Registre retiradas (sangria) ou entradas (suprimento) de dinheiro do caixa quando necessário." },
        { name: "Comissões", description: "Visualize o relatório de comissões por profissional baseado nos atendimentos realizados e pagos." },
      ]
    },
    {
      icon: <Package className="h-4 w-4" />,
      title: "Produtos",
      description: "Estoque e fornecedores",
      features: [
        { name: "Cadastro de Produtos", description: "Registre nome, marca, categoria, tipo (sólido, líquido, creme, gel, pó) e unidade de medida." },
        { name: "Controle de Estoque", description: "Acompanhe quantidade atual, defina alertas de estoque mínimo e registre novas compras." },
        { name: "Alertas Automáticos", description: "O sistema avisa quando um produto está com estoque baixo, baseado no mínimo configurado." },
        { name: "Fornecedores", description: "Cadastre fornecedores com CNPJ, contato e endereço. Vincule fornecedores aos produtos para facilitar recompras." },
        { name: "Histórico de Uso", description: "Ao marcar um produto como finalizado, o sistema calcula automaticamente quantos atendimentos foram feitos e a média de uso por atendimento." },
      ]
    },
    {
      icon: <FileText className="h-4 w-4" />,
      title: "Documentos",
      description: "Contratos, Termos e Anamneses",
      features: [
        { name: "Modelos de Documento", description: "Crie modelos de Contrato, Termo de Consentimento ou Anamnese com campos variáveis (nome, CPF, data) preenchidos automaticamente." },
        { name: "Modelos Prontos", description: "Use modelos pré-prontos da plataforma para começar rapidamente, com o tipo (contrato/termo/anamnese) já identificado corretamente." },
        { name: "Preenchimento Público", description: "Gere um link único e envie ao cliente por WhatsApp. O cliente preenche e assina sem precisar criar conta — campos obrigatórios em vermelho bloqueiam o envio incompleto." },
        { name: "Assinatura Digital", description: "O cliente assina pelo dedo/mouse e o documento é armazenado vinculado ao cadastro, com nome correto (Contrato, Termo, Anamnese) em todas as listagens." },
        { name: "Prévia de Mensagem WhatsApp", description: "Antes de enviar, revise e edite a mensagem com instruções passo-a-passo para o cliente abrir e preencher o documento." },
      ]
    },
    {
      icon: <MessageCircle className="h-4 w-4" />,
      title: "WhatsApp",
      description: "Mensagens, automações e templates",
      features: [
        { name: "Conexão Evolution API", description: "Conecte sua conta de WhatsApp via QR Code direto pelas Configurações. O sistema mantém a conexão ativa com keep-alive automático." },
        { name: "Lembretes Automáticos", description: "Confirmações 24h e 1h antes do atendimento, alertas de inadimplência e estoque baixo enviados automaticamente." },
        { name: "Templates Personalizáveis", description: "Edite os modelos de mensagem com variáveis ({cliente}, {servico}, {data}, {hora}) e teste antes de salvar." },
        { name: "Prévia Editável", description: "Em todos os pontos onde aparece 'Enviar no WhatsApp' você revisa e edita a mensagem antes do envio." },
        { name: "Fila de Envio", description: "Mensagens são enfileiradas e reentregues automaticamente em caso de falha temporária de conexão." },
      ]
    },
    {
      icon: <Bell className="h-4 w-4" />,
      title: "Lembretes",
      description: "Gestão de lembretes e tarefas",
      features: [
        { name: "Lembretes Personalizados", description: "Crie lembretes para qualquer tarefa com data, hora e prioridade (alta, média, baixa)." },
        { name: "Lembretes Recorrentes", description: "Configure lembretes que se repetem diariamente, semanalmente ou mensalmente." },
        { name: "Categorias", description: "Organize lembretes por categorias como financeiro, administrativo, pessoal, etc." },
        { name: "Notificações", description: "Receba alertas quando os lembretes estiverem próximos do vencimento, com deep-link para a tela relacionada." },
      ]
    },
    {
      icon: <DollarSign className="h-4 w-4" />,
      title: "Financeiro",
      description: "Contas, recebíveis e comissões",
      features: [
        { name: "Contas a Pagar e Receber", description: "Cadastre despesas recorrentes, parcelamentos e receitas. Os lançamentos são sincronizados automaticamente com o caixa e os pacotes." },
        { name: "Categorias", description: "Organize entradas e saídas por categoria com filtros avançados por período, status e profissional." },
        { name: "Comissões", description: "Cálculo automático por percentual, valor fixo ou misto, com sobreposição por serviço. Marque como paga e gere recibo." },
        { name: "Boletos Parcelados", description: "Crie parcelamentos em até 24x com sincronização de status (pago, em aberto, vencido)." },
        { name: "Extrato com Saldo", description: "Visualize o extrato com saldo corrente acumulado para conciliação rápida." },
      ]
    },

    {
      icon: <ClipboardList className="h-4 w-4" />,
      title: "Relatórios",
      description: "Análises e estatísticas",
      features: [
        { name: "Aniversariantes", description: "Lista de clientes que fazem aniversário no período selecionado, ideal para ações de marketing." },
        { name: "Retornos Pendentes", description: "Clientes que precisam retornar baseado nos dias de retorno configurados nos serviços." },
        { name: "Clientes Inativos", description: "Identifique clientes que não comparecem há determinado período para ações de reativação." },
        { name: "Pacotes Ativos", description: "Acompanhe todos os pacotes vendidos, sessões utilizadas e restantes por cliente." },
      ]
    },
    {
      icon: <Shield className="h-4 w-4" />,
      title: "Auditoria",
      description: "Registro de ações do sistema",
      features: [
        { name: "Log de Ações", description: "Todas as ações importantes são registradas: quem fez, quando fez e o que foi alterado." },
        { name: "Filtros Avançados", description: "Filtre logs por usuário, tipo de ação, tabela afetada e período." },
        { name: "Rastreabilidade", description: "Visualize os dados antes e depois de cada alteração para auditoria completa." },
      ]
    },
    {
      icon: <Settings className="h-4 w-4" />,
      title: "Configurações",
      description: "Personalização do sistema",
      features: [
        { name: "Horário de Funcionamento", description: "Configure o horário de abertura, fechamento e intervalo entre slots da agenda." },
        { name: "Dias de Trabalho", description: "Defina se trabalha aos sábados e/ou domingos. A agenda reflete automaticamente." },
        { name: "Gerenciamento de Usuários", description: "Adicione usuários e defina suas permissões no sistema." },
        { name: "Permissões Individuais", description: "Configure permissões granulares para cada profissional: o que pode ver e alterar." },
        { name: "Integrações", description: "Configure integrações com WhatsApp para notificações automáticas aos clientes." },
      ]
    },
  ];

  const statusList = [
    { status: "scheduled", label: "Agendado", color: "bg-blue-500", description: "O agendamento foi criado e aguarda confirmação do cliente. Envie uma mensagem para confirmar." },
    { status: "confirmed", label: "Confirmado", color: "bg-green-500", description: "O cliente confirmou que irá comparecer. O agendamento está garantido." },
    { status: "completed", label: "Concluído", color: "bg-purple-500", description: "O atendimento foi realizado com sucesso. Agora você pode registrar o pagamento." },
    { status: "cancelled", label: "Cancelado", color: "bg-red-500", description: "O agendamento foi cancelado pelo cliente ou pela clínica. Não será realizado." },
    { status: "missed", label: "Faltou", color: "bg-orange-500", description: "O cliente não compareceu no horário marcado. Considere entrar em contato." },
    { status: "rescheduled", label: "Reagendado", color: "bg-yellow-500", description: "O agendamento foi remarcado para outra data ou horário." },
  ];

  const paymentStatus = [
    { status: "pending", label: "Pendente", color: "bg-gray-500", description: "O pagamento ainda não foi realizado. O valor total está em aberto." },
    { status: "partial", label: "Parcial", color: "bg-yellow-500", description: "Parte do valor foi paga. Há um saldo restante a receber." },
    { status: "paid", label: "Pago", color: "bg-green-500", description: "O valor total foi recebido. O pagamento está completo." },
  ];

  const permissions = [
    { action: "Ver Dashboard", description: "Acesso à visão geral com vendas e estatísticas do dia" },
    { action: "Gerenciar Agenda (própria)", description: "Ver e editar apenas os próprios agendamentos" },
    { action: "Ver Agenda de Outros", description: "Visualizar agendamentos de outros profissionais" },
    { action: "Modificar Agenda de Outros", description: "Editar ou cancelar agendamentos de outros profissionais" },
    { action: "Cadastrar Clientes", description: "Criar novos clientes no sistema" },
    { action: "Ver Clientes de Outros", description: "Visualizar clientes atendidos por outros profissionais" },
    { action: "Abrir/Fechar Caixa", description: "Iniciar e finalizar o movimento diário do caixa" },
    { action: "Dar Baixa em Pagamentos", description: "Registrar recebimentos e pagamentos" },
    { action: "Ver Lucro do Dia", description: "Acesso aos valores totais de receita e lucro" },
    { action: "Ver Caixa de Outros", description: "Visualizar movimentações de caixa de outros profissionais" },
    { action: "Cadastrar Produtos", description: "Adicionar e editar produtos no estoque" },
    { action: "Ver Relatórios Completos", description: "Acesso a relatórios de todos os profissionais" },
    { action: "Acessar Auditoria", description: "Visualizar logs de ações do sistema" },
    { action: "Acessar Configurações", description: "Alterar configurações gerais do sistema" },
    { action: "Gerenciar Usuários", description: "Adicionar, editar e remover usuários e permissões" },
    { action: "Deletar Registros", description: "Excluir permanentemente dados do sistema" },
  ];

  return (
    <AppLayout title="Central de Ajuda" subtitle="Guia completo do sistema">
      <PageTransition>
        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="space-y-4 pr-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid w-full grid-cols-4 h-9 bg-muted/50 p-1 gap-1">
                <TabsTrigger value="modules" className="text-xs border border-transparent data-[state=active]:bg-sky-500/15 data-[state=active]:text-sky-700 data-[state=active]:border-sky-500/40">Módulos</TabsTrigger>
                <TabsTrigger value="status" className="text-xs border border-transparent data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-700 data-[state=active]:border-emerald-500/40">Status</TabsTrigger>
                <TabsTrigger value="roles" className="text-xs border border-transparent data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-700 data-[state=active]:border-violet-500/40">Permissões</TabsTrigger>
                <TabsTrigger value="tips" className="text-xs border border-transparent data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-700 data-[state=active]:border-amber-500/40">Dicas</TabsTrigger>
              </TabsList>


            <TabsContent value="modules" className="space-y-3 page-enter">
              <p className="text-xs text-muted-foreground mb-4">
                Clique em cada módulo para expandir e ver os detalhes completos.
              </p>
              <div className="grid gap-3">
                {modules.map((module, index) => {
                  const isOpen = openModules.includes(module.title);
                  return (
                    <Collapsible key={index} open={isOpen} onOpenChange={() => toggleModule(module.title)}>
                      <Card className={cn("card-hover transition-all duration-200", isOpen && "ring-1 ring-primary/20")}>
                        <CollapsibleTrigger className="w-full">
                          <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 rounded-t-lg transition-colors">
                            <CardTitle className="flex items-center justify-between text-sm font-medium">
                              <div className="flex items-center gap-2">
                                <div className="rounded-lg bg-primary/10 p-1.5">
                                  {module.icon}
                                </div>
                                {module.title}
                              </div>
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </CardTitle>
                            <CardDescription className="text-xs text-left">{module.description}</CardDescription>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0">
                            <ScrollArea className="h-[250px]">
                              <div className="space-y-3 pt-2 border-t pr-3">
                                {module.features.map((feature, idx) => (
                                  <div key={idx} className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                                    <div className="flex items-start gap-2">
                                      <HelpCircle className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                                      <div>
                                        <p className="text-xs font-medium text-foreground">{feature.name}</p>
                                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{feature.description}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </CardContent>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="status" className="space-y-4 page-enter">
              <Card className="card-hover">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Status dos Agendamentos
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Clique em cada status para ver a descrição completa
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {statusList.map((item, idx) => (
                      <Collapsible key={idx}>
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${item.color}`} />
                              <span className="text-xs font-medium">{item.label}</span>
                            </div>
                            <ChevronDown className="h-3 w-3 text-muted-foreground" />
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-3 py-2 text-[11px] text-muted-foreground bg-muted/30 rounded-b-lg -mt-1">
                            {item.description}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="card-hover">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Status de Pagamento
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {paymentStatus.map((item, idx) => (
                      <Collapsible key={idx}>
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${item.color}`} />
                              <span className="text-xs font-medium">{item.label}</span>
                            </div>
                            <ChevronDown className="h-3 w-3 text-muted-foreground" />
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-3 py-2 text-[11px] text-muted-foreground bg-muted/30 rounded-b-lg -mt-1">
                            {item.description}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="roles" className="space-y-4 page-enter">
              <Card className="card-hover">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Sistema de Permissões
                  </CardTitle>
                  <CardDescription className="text-xs">
                    As permissões são configuradas individualmente para cada profissional pelo administrador
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 mb-4">
                    <p className="text-xs text-foreground font-medium mb-1">Como funciona?</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Cada profissional tem suas permissões configuradas manualmente pelo administrador.
                      Isso significa que você pode dar acesso específico a cada pessoa, sem depender de funções pré-definidas.
                      Acesse <span className="font-medium">Cadastros → Profissionais</span> para configurar.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-hover">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Lista de Permissões Disponíveis</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {permissions.map((perm, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                          <p className="text-xs font-medium">{perm.action}</p>
                          <p className="text-[10px] text-muted-foreground">{perm.description}</p>
                        </div>
                      ))}
                    </div>
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
                    <p className="text-xs text-muted-foreground">• Use a busca global (Ctrl+K) para encontrar clientes rapidamente</p>
                    <p className="text-xs text-muted-foreground">• Configure lembretes automáticos para reduzir faltas</p>
                    <p className="text-xs text-muted-foreground">• Mantenha o estoque atualizado para evitar surpresas</p>
                    <p className="text-xs text-muted-foreground">• Revise o caixa diariamente para manter controle</p>
                    <p className="text-xs text-muted-foreground">• Use filtros para encontrar informações rapidamente</p>
                  </CardContent>
                </Card>

                <Card className="card-hover">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">🚀 Boas Práticas</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">• Confirme agendamentos com antecedência via WhatsApp</p>
                    <p className="text-xs text-muted-foreground">• Registre observações importantes nos clientes</p>
                    <p className="text-xs text-muted-foreground">• Acompanhe os relatórios semanalmente</p>
                    <p className="text-xs text-muted-foreground">• Fotografe o progresso dos tratamentos</p>
                    <p className="text-xs text-muted-foreground">• Mantenha os dados de contato atualizados</p>
                  </CardContent>
                </Card>

                <Card className="card-hover md:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">⚡ Atalhos de Produtividade</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div className="p-2 rounded-lg bg-muted/30">
                        <p className="text-xs font-medium">Busca Rápida</p>
                        <p className="text-[10px] text-muted-foreground">Ctrl + K</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30">
                        <p className="text-xs font-medium">Novo Agendamento</p>
                        <p className="text-[10px] text-muted-foreground">Clique no horário vazio</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30">
                        <p className="text-xs font-medium">Ver Detalhes</p>
                        <p className="text-[10px] text-muted-foreground">Clique no agendamento</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30">
                        <p className="text-xs font-medium">Editar Cliente</p>
                        <p className="text-[10px] text-muted-foreground">Clique no nome do cliente</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30">
                        <p className="text-xs font-medium">Exportar Dados</p>
                        <p className="text-[10px] text-muted-foreground">Botão de download em cada lista</p>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/30">
                        <p className="text-xs font-medium">Filtrar Resultados</p>
                        <p className="text-[10px] text-muted-foreground">Use os filtros em cada página</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
        </ScrollArea>
      </PageTransition>
    </AppLayout>
  );
};

export default Ajuda;