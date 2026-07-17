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
    intro: () => 'Não conseguimos processar o pagamento da sua assinatura. Por favor, verifique seu meio de pagamento para evitar a suspensão do acesso.',
    detail: () => 'Acesse Assinatura → Gerenciar assinatura para atualizar o cartão ou tentar novamente.',
  },
  past_due: {
    title: 'Sua assinatura está em atraso',
    intro: () => 'O pagamento da sua assinatura ficou pendente. Regularize para manter seu acesso ativo.',
    detail: () => 'Acesse Assinatura → Gerenciar assinatura para atualizar o cartão ou tentar novamente.',
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
