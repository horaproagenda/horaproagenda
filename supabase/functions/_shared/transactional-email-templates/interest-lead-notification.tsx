/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
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

interface Props {
  name?: string
  email?: string
  whatsapp?: string
  businessArea?: string
  message?: string
  receivedAt?: string
}

const InterestLeadNotification = ({
  name = '',
  email = '',
  whatsapp = '',
  businessArea = '',
  message = '',
  receivedAt = '',
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Novo interesse recebido no {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Novo "Tenho interesse"</Heading>
        <Text style={text}>
          Alguém preencheu o formulário de interesse na página do {SITE_NAME}.
        </Text>
        <Section style={box}>
          <Text style={label}>Nome</Text>
          <Text style={value}>{name || '—'}</Text>
          <Text style={label}>E-mail</Text>
          <Text style={value}>{email || '—'}</Text>
          <Text style={label}>WhatsApp</Text>
          <Text style={value}>{whatsapp || '—'}</Text>
          <Text style={label}>Área de atuação</Text>
          <Text style={value}>{businessArea || '—'}</Text>
          <Text style={label}>Mensagem</Text>
          <Text style={value}>{message || '—'}</Text>
          <Text style={label}>Recebido em</Text>
          <Text style={value}>{receivedAt || '—'}</Text>
        </Section>
        <Text style={footer}>
          Notificação automática do {SITE_NAME}. Responda diretamente ao contato
          informado acima.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: InterestLeadNotification,
  to: 'horaproagenda@gmail.com',
  subject: `Novo interesse recebido no ${SITE_NAME}`,
  displayName: 'Novo interesse (interno)',
  previewData: {
    name: 'Maria Silva',
    email: 'maria@exemplo.com',
    whatsapp: '(11) 99999-0000',
    businessArea: 'Estética',
    message: 'Gostaria de saber mais sobre os planos.',
    receivedAt: '01/08/2026 17:40',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '"Poppins", "Helvetica Neue", Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '500px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0F4C5C', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#2A2D34', lineHeight: '1.5', margin: '0 0 20px' }
const box = { backgroundColor: '#f7f7f9', borderRadius: '12px', padding: '20px', margin: '20px 0' }
const label = { fontSize: '11px', textTransform: 'uppercase' as const, color: '#999', margin: '0 0 4px', letterSpacing: '0.5px' }
const value = { fontSize: '15px', fontWeight: 600 as const, color: '#222', margin: '0 0 16px' }
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
