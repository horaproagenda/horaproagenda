/**
 * Marca Hora Pro — fonte única de copy e identidade.
 * Reutilizada em landing, e-mails, metadados e App Store.
 */

export const BRAND = {
  name: "Hora Pro",
  shortName: "Hora Pro",
  domain: "agendalume.app", // TODO: migrar para horapro.app após registro do domínio
  url: "https://agendalume.app",
  twitter: "@HoraProApp",
  email: "contato@agendalume.app",
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
  "Hora Pro: agenda profissional com WhatsApp, financeiro, pacotes e comissões — em tempo real, no celular ou desktop.";

export const LONG_DESCRIPTION = `O Hora Pro é o aplicativo de agendamento profissional para quem atende com hora marcada. Ideal para clínicas de estética, salões de beleza, barbearias, fisioterapeutas, podólogos, terapeutas e qualquer profissional autônomo da área de serviços e bem-estar.

Com o Hora Pro você organiza sua agenda em tempo real, evita conflitos de horário, envia lembretes automáticos pelo WhatsApp e controla o financeiro do seu negócio em um só lugar — tudo sincronizado entre celular, tablet e computador.

Principais recursos:
• Agenda em tempo real com bloqueio automático de horários
• Lembretes e confirmações via WhatsApp (24h e 1h antes)
• Cadastro completo de clientes com histórico, fotos e documentos
• Pacotes de sessões com saldo automático e intervalo mínimo
• Controle financeiro: caixa, recebíveis, comissões e relatórios
• Multiusuário com permissões (admin, recepção, profissional, financeiro)
• Aplicativo instalável (PWA) no iPhone e Android — sem loja
• Funciona com conexão instável e sincroniza quando volta a internet

Comece grátis, sem cartão de crédito. Em 2 minutos sua agenda está pronta para receber clientes.`;
