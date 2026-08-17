/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Hora Pro'
const APP_URL = 'https://horaproagenda.app'

type Kind =
  | 'payment_recorded'
  | 'trial_extended'
  | 'lifetime_granted'
  | 'subscription_activated'
  | 'payment_failed'
  | 'past_due'
  | 'seats_near_limit'
  | 'seats_blocked'
  | 'trial_charge_failed'
  | 'payment_grace_staff'
  | 'access_suspended'

interface Props {
  kind?: Kind
  name?: string
  /** dd/mm/aaaa formatted by sender */
  validUntil?: string
  /** for trial_extended */
  extraDays?: number
  /** for payment_recorded */
  months?: number
  /** for subscription_activated */
  planLabel?: string
  /** for seat-related notifications */
  used?: number
  seatLimit?: number
  attemptedEmail?: string
  /** cobrança recusada: dd/mm/aaaa em que a carência termina */
  graceDeadline?: string
  /** cobrança recusada: dias restantes de carência */
  graceDays?: number
  /** valor da cobrança recusada, já formatado (ex.: "R$ 149,00") */
  amount?: string
  /** motivo/observação extra */
  reason?: string
  /** nome/e-mail do administrador da conta (avisos para a equipe) */
  adminEmail?: string
  /** true quando o destinatário é o administrador (mostra a ação de pagamento) */
  isAdmin?: boolean
}


const COPY: Record<Kind, { title: string; intro: (p: Props) => string; detail?: (p: Props) => string }> = {
  payment_recorded: {
    title: 'Pagamento confirmado',
    intro: () => 'Demos baixa manualmente no seu pagamento e sua conta está liberada.',
    detail: (p) => `Período liberado: ${p.months ?? 1} ${(p.months ?? 1) > 1 ? 'meses' : 'mês'}${p.validUntil ? ` · válido até ${p.validUntil}` : ''}.`,
  },
  trial_extended: {
    title: 'Seu período de teste foi estendido',
    intro: () => 'Acabamos de adicionar mais dias ao seu trial gratuito.',
    detail: (p) => `+${p.extraDays ?? 0} dia(s) adicionados${p.validUntil ? ` · novo término em ${p.validUntil}` : ''}.`,
  },
  lifetime_granted: {
    title: 'Acesso vitalício concedido',
    intro: () => 'Você recebeu acesso vitalício gratuito ao Hora Pro.',
    detail: () => 'Sua conta segue ativa sem necessidade de assinatura.',
  },
  subscription_activated: {
    title: 'Assinatura ativada',
    intro: () => 'Recebemos seu pagamento e sua assinatura está ativa.',
    detail: (p) => `${p.planLabel ? `Plano: ${p.planLabel}. ` : ''}${p.validUntil ? `Próxima renovação em ${p.validUntil}.` : ''}`,
  },
  payment_failed: {
    title: 'Falha no pagamento da sua assinatura',
    intro: (p) =>
      `Não conseguimos processar o pagamento da sua assinatura${p.amount ? ` no valor de ${p.amount}` : ''}. `
      + (p.graceDays
        ? `Seu acesso continua liberado por ${p.graceDays} dia(s)${p.graceDeadline ? `, até ${p.graceDeadline}` : ''}.`
        : 'Regularize agora para não perder o acesso.'),
    detail: (p) =>
      `Administrador: abra o aplicativo em Assinatura → Gerenciar assinatura e atualize a forma de pagamento (cartão de crédito ou débito) para reativar a cobrança automática.`
      + (p.graceDeadline ? ` Após ${p.graceDeadline} o acesso de todos os usuários da conta será suspenso.` : '')
      + (p.reason ? ` ${p.reason}` : ''),
  },
  past_due: {
    title: 'Sua assinatura está em atraso',
    intro: (p) =>
      'O pagamento da sua assinatura ficou pendente. '
      + (p.graceDays
        ? `Você está em período de carência: restam ${p.graceDays} dia(s)${p.graceDeadline ? ` (até ${p.graceDeadline})` : ''}.`
        : 'Regularize para manter seu acesso ativo.'),
    detail: () => 'Administrador: acesse Assinatura → Gerenciar assinatura para atualizar a forma de pagamento ou tentar a cobrança novamente.',
  },
  trial_charge_failed: {
    title: 'A cobrança do fim do seu teste gratuito não foi aprovada',
    intro: (p) =>
      `Seu período de teste gratuito terminou e a cobrança automática${p.amount ? ` de ${p.amount}` : ''} foi recusada pelo emissor do cartão. `
      + (p.graceDays
        ? `Concedemos ${p.graceDays} dia(s) de carência${p.graceDeadline ? `, até ${p.graceDeadline}` : ''}, para você regularizar sem perder nada.`
        : 'Regularize agora para continuar usando o Hora Pro.'),
    detail: (p) =>
      'Administrador: entre no aplicativo, abra Assinatura → Gerenciar assinatura e cadastre um novo cartão de crédito ou débito. A cobrança é reenviada automaticamente após a atualização.'
      + (p.graceDeadline ? ` Se não houver pagamento até ${p.graceDeadline}, o acesso de toda a equipe será suspenso.` : ''),
  },
  payment_grace_staff: {
    title: 'Atenção: pagamento da assinatura pendente',
    intro: (p) =>
      'O pagamento da assinatura do Hora Pro desta conta não foi aprovado. '
      + (p.graceDays
        ? `O acesso continua liberado por ${p.graceDays} dia(s)${p.graceDeadline ? `, até ${p.graceDeadline}` : ''}.`
        : 'O acesso pode ser suspenso a qualquer momento.'),
    detail: (p) =>
      `Somente o administrador da conta${p.adminEmail ? ` (${p.adminEmail})` : ''} pode atualizar a forma de pagamento. Avise-o para evitar a interrupção do atendimento.`,
  },
  access_suspended: {
    title: 'Acesso suspenso por falta de pagamento',
    intro: (p) =>
      'O período de carência terminou e o pagamento da assinatura continua pendente, por isso o acesso da conta foi suspenso.'
      + (p.reason ? ` ${p.reason}` : ''),
    detail: () => 'Administrador: atualize a forma de pagamento em Assinatura → Gerenciar assinatura. O acesso de todos os usuários é reativado automaticamente após a confirmação do pagamento.',
  },
  seats_near_limit: {
    title: 'Você está perto do limite de usuários',
    intro: (p) => `Sua conta está usando ${p.used ?? 0} de ${p.seatLimit ?? 0} assentos disponíveis no seu plano.`,
    detail: () => 'Considere fazer upgrade em Assinatura para evitar bloqueios ao adicionar novos colaboradores.',
  },
  seats_blocked: {
    title: 'Não foi possível adicionar um novo colaborador',
    intro: (p) => `Uma tentativa de cadastro${p.attemptedEmail ? ` (${p.attemptedEmail})` : ''} foi bloqueada porque sua conta atingiu o limite de ${p.seatLimit ?? 0} usuário(s).`,
    detail: () => 'Faça upgrade do seu plano em Assinatura para liberar mais assentos e tentar novamente.',
  },
}


const Email = ({ kind = 'payment_recorded', name, ...rest }: Props) => {
  const c = COPY[kind]
  const props = { kind, name, ...rest }
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{c.title} — {SITE_NAME}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{c.title}</Heading>
          <Text style={text}>Olá{name ? `, ${name}` : ''}!</Text>
          <Text style={text}>{c.intro(props)}</Text>
          {c.detail && (
            <Section style={highlight}>
              <Text style={highlightText}>{c.detail(props)}</Text>
            </Section>
          )}
          <Section style={{ textAlign: 'center', margin: '28px 0 8px' }}>
            <Button href={APP_URL} style={btn}>Abrir o {SITE_NAME}</Button>
          </Section>
          <Text style={footer}>
            Se você não esperava este e-mail, entre em contato com nosso suporte.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => {
    const k = (data?.kind ?? 'payment_recorded') as Kind
    return `${COPY[k]?.title ?? 'Atualização da sua conta'} — ${SITE_NAME}`
  },
  displayName: 'Atualização da conta',
  previewData: { kind: 'payment_recorded', name: 'Maria', months: 1, validUntil: '04/07/2026' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '"Poppins", "Helvetica Neue", Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '520px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0F4C5C', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#2A2D34', lineHeight: '1.6', margin: '0 0 14px' }
const highlight = {
  backgroundColor: '#F5F1EA',
  border: '1px solid #F4A261',
  borderRadius: '12px',
  padding: '14px 16px',
  margin: '16px 0',
}
const highlightText = { fontSize: '14px', color: '#1a1a1a', margin: 0, fontWeight: 500 as const }
const btn = {
  backgroundColor: '#0F4C5C',
  color: '#ffffff',
  padding: '12px 22px',
  borderRadius: '10px',
  fontSize: '14px',
  fontWeight: 600 as const,
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '24px 0 0' }
