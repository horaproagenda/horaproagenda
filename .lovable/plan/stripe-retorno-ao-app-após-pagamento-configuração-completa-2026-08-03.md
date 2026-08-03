# Stripe: retorno ao app após pagamento + configuração completa

## Situação atual (verificada)

- O checkout abre em **nova aba** (`window.open(data.url, "_blank")` em `AssinaturaSection.tsx:81,103,120` e `AssinaturaStatus.tsx:74`). Resultado: o pagamento termina numa aba nova, e a aba original do app continua com a assinatura desatualizada/bloqueada.
- `success_url` já aponta para `/assinatura/sucesso?session_id=...`, e essa página faz polling de até 20s, mas **não volta sozinha** para o app — exige clique no botão.
- No Stripe (conta `Hora Pro Agenda`, modo live) existe 1 produto e 3 preços ativos com lookup keys:
  - `horapro_seat_monthly` — R$ 110,00 por usuário/mês
  - `horapro_seat_semiannual` — R$ 645,62 por usuário/6 meses
  - `horapro_seat_annual` — R$ 1.276,86 por usuário/ano
- A cobrança por usuário já funciona por `quantity = seats` (1, 3, 6, 10, 15, 20, 25, 30) no price do ciclo.
- Cartão usa `mode: subscription`; Pix e Boleto usam `mode: payment` (pré-pago) com liberação por `metadata.kind = prepay` no webhook.

## O que será implementado

### 1. Voltar para o app aberto, corretamente
- Novo utilitário `src/lib/stripeCheckout.ts`: navega para o Stripe **na mesma aba**, memoriza a rota de origem e avisa outras abas quando a assinatura muda.
- `AssinaturaSection.tsx` e `AssinaturaStatus.tsx`: trocar `window.open(..., "_blank")` por essa navegação na mesma aba (cartão, Pix, Boleto e Portal).
- `AssinaturaSucesso.tsx`: ao confirmar o pagamento, atualizar os caches de assinatura/assentos e **redirecionar automaticamente** para a tela de origem (ou o dashboard) — com botão manual como alternativa.
- `useAccountSubscription.ts`: revalidar a assinatura ao voltar o foco da janela e ao receber o aviso de outras abas, para que nenhuma aba fique presa em "sem acesso" depois de pagar.

### 2. Checkout mais completo
- `create-checkout` (cartão/assinatura): idioma `pt-BR`, `client_reference_id` com o id do usuário, coleta de CPF/CNPJ e endereço de cobrança, atualização automática dos dados do cliente no Stripe, e `success_url` sinalizando o retorno.
- `create-pix-checkout` (Pix/Boleto): idioma `pt-BR` e `client_reference_id`, mantendo a validação de CPF/CNPJ e a expiração já existentes.
- `customer-portal`: retorno para a página de assinatura já sinalizada como "voltando do portal", para forçar a revalidação do status.

### 3. Verificação
- Rodar o fluxo no preview com Playwright até a tela do Stripe para confirmar que a navegação acontece na mesma aba e sem erro de Edge Function.
- Conferir nos logs das funções que a sessão é criada com o price resolvido pela lookup key.

## Passo a passo para você fazer no painel do Stripe

Coisas que só podem ser feitas na sua conta (eu não consigo alterar):

1. **Métodos de pagamento** — Configurações > Pagamentos > Métodos de pagamento: ativar `Pix` e `Boleto` (e manter cartão). Sem isso o checkout de Pix/Boleto falha.
2. **Portal do cliente** — Configurações > Faturamento > Portal do cliente: ativar, permitir atualizar meio de pagamento, ver faturas e cancelar assinatura; definir a URL de retorno `https://horaproagenda.app/assinatura`.
3. **Webhook** — Desenvolvedores > Webhooks: confirmar o endpoint apontando para a função `stripe-webhook` com os eventos `customer.subscription.*`, `invoice.payment_succeeded`, `invoice.payment_failed`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.dispute.*`, `charge.refunded`, `refund.*`, `price.*`, `product.updated`.
4. **Mudar preço por usuário** — crie um preço novo no produto "Hora Pro - Assinatura" e **transfira a lookup key** (`horapro_seat_monthly`, `horapro_seat_semiannual` ou `horapro_seat_annual`) para ele. O app e o Supabase passam a usar o novo valor automaticamente, sem deploy.
5. **Cobrança e recibos** — Configurações > Faturamento: ativar e-mails de fatura/recibo e as tentativas automáticas de recobrança (Smart Retries) para falhas de cartão.
6. **Marca** — Configurações > Marca: logo, cor e nome no extrato, para o checkout ficar com a identidade Hora Pro.
