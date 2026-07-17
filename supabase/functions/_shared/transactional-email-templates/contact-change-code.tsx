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
  code?: string
  type?: 'email' | 'phone'
  newValue?: string
}

const ContactChangeCode = ({ code = '000000', type = 'email', newValue = '' }: Props) => {
  const label = type === 'email' ? 'e-mail' : 'celular'
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>Confirme a alteração do seu {label} no {SITE_NAME}: {code}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Confirme a alteração do seu {label}</Heading>
          <Text style={text}>
            Recebemos um pedido para alterar o {label} da sua conta {SITE_NAME}{' '}
            {newValue ? (<>para <strong>{newValue}</strong>.</>) : '.'}
          </Text>
          <Text style={text}>
            Use o código abaixo para confirmar:
          </Text>
          <Section style={codeBox}>
            <Text style={codeText}>{code}</Text>
          </Section>
          <Text style={text}>Este código é válido por <strong>10 minutos</strong>.</Text>
          <Text style={footer}>
            Se você não solicitou esta alteração, ignore este e-mail e altere sua senha
            por segurança.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ContactChangeCode,
  subject: (data: Record<string, any>) =>
    data?.type === 'phone'
      ? `Confirme a alteração do seu celular — ${SITE_NAME}`
      : `Confirme a alteração do seu e-mail — ${SITE_NAME}`,
  displayName: 'Alteração de contato',
  previewData: { code: '123456', type: 'email', newValue: 'novo@email.com' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '"Poppins", "Helvetica Neue", Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '500px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0F4C5C', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#2A2D34', lineHeight: '1.5', margin: '0 0 20px' }
const codeBox = {
  backgroundColor: '#0F4C5C',
  borderRadius: '12px',
  padding: '24px',
  textAlign: 'center' as const,
  margin: '24px 0',
}
const codeText = {
  fontSize: '32px',
  fontWeight: 'bold' as const,
  letterSpacing: '8px',
  color: '#ffffff',
  margin: '0',
  fontFamily: 'monospace',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
