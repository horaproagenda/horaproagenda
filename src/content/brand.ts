/**
 * Marca Hora Pro — fonte única de copy e identidade.
 * Reutilizada em landing, e-mails, metadados e App Store.
 *
 * IMPORTANTE: nunca escreva o nome da marca em hard-code em
 * componentes — sempre importe `BRAND.name` daqui. Existe um teste
 * de regressão (`src/content/__tests__/brand-references.test.ts`)
 * que falha se nomes antigos voltarem para o código.
 */

export const BRAND = {
  name: "Hora Pro",
  shortName: "Hora Pro",
  domain: "horaproagenda.app",
  url: "https://horaproagenda.app",
  twitter: "@HoraProApp",
  email: "contato@horaproagenda.app",
  supportEmail: "suporte@horaproagenda.app",
} as const;

export const TAGLINES = [
  "Sua hora, no controle.",
  "Agenda profissional, sem atrito.",
  "O tempo que trabalha por você.",
  "Cada minuto, na hora certa.",
  "Agende. Receba. Cresça.",
] as const;

export const PRIMARY_TAGLINE = TAGLINES[0];

export const SHORT_DESCRIPTION =
  "Hora Pro: agenda profissional com WhatsApp automático (5 dias, 1 dia e pós-atendimento), financeiro com taxa de maquininha, boleto parcelado, documentos com assinatura Gov.br e autocadastro de clientes — em tempo real.";

export const LONG_DESCRIPTION = `O Hora Pro é o aplicativo de agendamento profissional para quem atende com hora marcada. Ideal para clínicas de estética, salões de beleza, barbearias, fisioterapeutas, podólogos, terapeutas e qualquer profissional autônomo da área de serviços e bem-estar.

Com o Hora Pro você organiza sua agenda em tempo real, evita conflitos de horário, automatiza a comunicação pelo WhatsApp e controla o financeiro do seu negócio em um só lugar — tudo sincronizado entre celular, tablet e computador.

Diferenciais exclusivos:

• WhatsApp 100% automático: confirmação 5 dias antes, lembrete 1 dia antes, mensagem de pós-atendimento e felicitação no aniversário do cliente — tudo enviado sem intervenção manual.
• Financeiro inteligente: cálculo automático da taxa da maquininha somada ao valor total do serviço, considerando bandeira do cartão e número de parcelas. Boleto parcelado com aviso automático de atraso para o cliente.
• Documentos digitais com Gov.br: envio do documento via WhatsApp ou link, preenchimento online pelo cliente e assinatura digital com certificado Gov.br — sem papel, com validade jurídica.
• Autocadastro de clientes: link público em que o próprio cliente preenche dados pessoais, anexa documentos e assina termos com certificado digital Gov.br — antes mesmo do primeiro atendimento.
• Lembretes pessoais e profissionais: notificações de tarefas, prazos e compromissos do dia a dia do negócio e da equipe.
• Relatórios completos: histórico de todos os atendimentos, produtos consumidos por atendimento, faturamento, comissões e custos — pronto para tomar decisão.

Principais recursos:

• Agenda em tempo real com bloqueio automático de horários e prevenção de conflitos
• Confirmações e lembretes automáticos via WhatsApp (5 dias, 1 dia, pós-atendimento e aniversário)
• Cadastro completo de clientes com histórico, fotos, documentos e autocadastro via link
• Pacotes de sessões com saldo automático e intervalo mínimo entre aplicações
• Controle financeiro com taxa de maquininha por bandeira e parcelas, boleto parcelado e aviso de atraso
• Documentos com assinatura digital Gov.br via WhatsApp ou link
• Multiusuário com permissões (admin, recepção, profissional, financeiro)
• Aplicativo instalável (PWA) no iPhone e Android — sem loja
• Funciona com conexão instável e sincroniza quando volta a internet

Comece grátis, sem cartão de crédito. Em 2 minutos sua agenda está pronta para receber clientes.`;

/**
 * Diferenciais usados na landing pública.
 */
export const DIFFERENTIALS = [
  {
    title: "WhatsApp 100% automático",
    desc: "Confirmação 5 dias antes, lembrete 1 dia antes, pós-atendimento e felicitação no aniversário do cliente — sem intervenção manual.",
  },
  {
    title: "Taxa da maquininha calculada",
    desc: "O sistema soma automaticamente a taxa da maquininha ao valor do serviço, conforme bandeira e número de parcelas.",
  },
  {
    title: "Boleto parcelado com aviso de atraso",
    desc: "Emita boletos parcelados e o cliente recebe aviso automático de atraso pelo WhatsApp.",
  },
  {
    title: "Documentos com assinatura Gov.br",
    desc: "Envie documentos via WhatsApp ou link e o cliente assina digitalmente com certificado Gov.br — validade jurídica, sem papel.",
  },
  {
    title: "Autocadastro do cliente",
    desc: "Link público para o cliente preencher dados, anexar documentos e assinar termos com Gov.br antes do primeiro atendimento.",
  },
  {
    title: "Lembretes pessoais e profissionais",
    desc: "Notificações de tarefas, prazos e compromissos — pessoais e do negócio — para você e sua equipe.",
  },
  {
    title: "Relatórios completos",
    desc: "Atendimentos realizados, produtos consumidos por atendimento, faturamento, comissões e custos — em poucos cliques.",
  },
];
