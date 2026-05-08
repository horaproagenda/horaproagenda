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

const SITE_NAME = 'Agendalume'

interface VerificationCodeProps {
  code?: string
  type?: 'signup' | 'login'
}

const VerificationCodeEmail = ({ code = '000000', type = 'signup' }: VerificationCodeProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de verificação {SITE_NAME}: {code}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {type === 'signup' ? 'Confirme seu cadastro' : 'Acesse sua conta'}
        </Heading>
        <Text style={text}>
          {type === 'signup'
            ? `Bem-vindo(a) ao ${SITE_NAME}! Use o código abaixo para concluir seu cadastro:`
            : `Use o código abaixo para acessar sua conta no ${SITE_NAME}:`}
        </Text>
        <Section style={codeBox}>
          <Text style={codeText}>{code}</Text>
        </Section>
        <Text style={text}>
          Este código é válido por <strong>10 minutos</strong>.
        </Text>
        <Text style={footer}>
          Se você não solicitou este código, pode ignorar este e-mail com segurança.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: VerificationCodeEmail,
  subject: (data: Record<string, any>) =>
    data?.type === 'login'
      ? `Código de acesso ${SITE_NAME}`
      : `Código de cadastro ${SITE_NAME}`,
  displayName: 'Código de verificação',
  previewData: { code: '123456', type: 'signup' },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '"Poppins", "Helvetica Neue", Arial, sans-serif',
}
const container = { padding: '20px 25px', maxWidth: '500px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 20px',
}
const codeBox = {
  backgroundColor: 'hsl(333, 71%, 50%)',
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
