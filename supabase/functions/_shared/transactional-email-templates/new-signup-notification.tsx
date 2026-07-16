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
  signupTime?: string
  totalAccounts?: number
}

const NewSignupNotification = ({ signupTime = '', totalAccounts = 0 }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Novo cadastro no {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Novo cadastro no {SITE_NAME}</Heading>
        <Text style={text}>
          Um novo profissional acaba de concluir o cadastro no aplicativo.
        </Text>
        <Section style={box}>
          <Text style={label}>Data e hora do cadastro</Text>
          <Text style={value}>{signupTime}</Text>
          <Text style={label}>Total de contas no sistema</Text>
          <Text style={value}>{totalAccounts}</Text>
        </Section>
        <Text style={text}>
          Providencie a compra de uma nova instância do WhatsApp para
          disponibilizar ao novo usuário assim que ele efetuar o pagamento.
        </Text>
        <Text style={footer}>
          Esta notificação foi gerada automaticamente e não contém nenhum dado
          pessoal do novo profissional, preservando a privacidade do cadastro.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: NewSignupNotification,
  to: 'horaproagenda@gmail.com',
  subject: `Novo cadastro no ${SITE_NAME}`,
  displayName: 'Novo cadastro (interno)',
  previewData: { signupTime: '16/07/2026 14:32', totalAccounts: 42 },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '"Poppins", "Helvetica Neue", Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '500px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#000000', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.5', margin: '0 0 20px' }
const box = { backgroundColor: '#f7f7f9', borderRadius: '12px', padding: '20px', margin: '20px 0' }
const label = { fontSize: '11px', textTransform: 'uppercase' as const, color: '#999', margin: '0 0 4px', letterSpacing: '0.5px' }
const value = { fontSize: '16px', fontWeight: 600 as const, color: '#222', margin: '0 0 16px' }
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
