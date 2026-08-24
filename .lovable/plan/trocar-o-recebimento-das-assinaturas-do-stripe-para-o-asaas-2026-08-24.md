# Trocar o recebimento das assinaturas do Stripe para o Asaas

Objetivo: o usuário paga no Asaas (Pix, cartão de crédito ou boleto) e o acesso ao aplicativo é liberado em tempo real, assim que o Asaas confirma o pagamento. O Stripe deixa de ser usado.

## Como vai funcionar

1. Na tela de Assinatura o administrador escolhe a quantidade de usuários e o ciclo (mensal, semestral, anual).
2. O app cria a cobrança/assinatura no Asaas em nome dele e abre a tela de pagamento do Asaas (Pix com QR Code, cartão ou boleto) na mesma aba.
3. Assim que o Asaas confirma o pagamento, ele avisa o aplicativo (webhook). A conta passa para "ativa" na hora, com o número de usuários contratado e a data do próximo ciclo.
4. A tela de retorno confirma o pagamento e leva o usuário direto de volta para onde ele estava. Se o Pix/boleto ainda estiver em análise, a tela avisa que não é preciso pagar de novo e libera sozinha quando o Asaas confirmar.
5. Cobrança recorrente: a assinatura no Asaas gera a cobrança de cada ciclo automaticamente. Pagamento confirmado renova o acesso; pagamento vencido coloca a conta em atraso (com os avisos e o período de tolerância que já existem hoje) e depois bloqueia.
6. O teste gratuito de 30 dias sem cartão continua igual.

## Valores e descontos

Os valores e descontos são definidos **por você, no painel do Asaas**, através de Links de Pagamento — um para cada combinação de plano/ciclo (ex.: "Hora Pro 1 usuário mensal"). O aplicativo lê esses valores do Asaas em tempo real e os exibe na tela de Assinatura, sem valor fixo no código. Ao alterar o valor no Asaas, o app passa a cobrar o novo valor (com um pequeno cache de alguns minutos).

## O que você precisa fazer no Asaas

1. Gerar a chave de API (Integrações > API) — sandbox para testes e produção depois. Eu peço a chave por um campo seguro; ela nunca fica no código.
2. Criar os Links de Pagamento de cada plano/ciclo com os valores e descontos desejados, seguindo o padrão de nome que eu vou definir com você (para o app saber qual link é qual plano).
3. Ativar Pix, cartão de crédito e boleto na conta.
4. Cadastrar o webhook apontando para a função `asaas-webhook` do aplicativo (eu passo a URL e o token depois de implementar).

## Detalhes técnicos

- Banco: nova migration acrescentando em `account_subscriptions` as colunas `asaas_customer_id`, `asaas_subscription_id`, `asaas_payment_id`, `payment_provider` (mantendo as colunas Stripe apenas como histórico); tabela `processed_asaas_events` para não processar o mesmo aviso duas vezes; `pricing_cache` reaproveitado para os preços vindos do Asaas.
- Segredos: `ASAAS_API_KEY`, `ASAAS_ENV` (sandbox/production), `ASAAS_WEBHOOK_TOKEN`.
- Novas Edge Functions: `asaas-create-subscription` (cria/reaproveita o cliente no Asaas com CPF/CNPJ, cria a assinatura com `externalReference` = id do usuário e devolve a URL de pagamento), `asaas-webhook` (valida o token, trata `PAYMENT_CONFIRMED`/`RECEIVED`/`OVERDUE`/`REFUNDED` e as mudanças de assinatura, atualizando `account_subscriptions`), `asaas-get-pricing` (lê os links de pagamento do Asaas e atualiza o `pricing_cache`), `asaas-check-subscription` (consulta sob demanda no retorno da tela de sucesso, para não depender do webhook).
- Frontend: `AssinaturaSection.tsx`, `AssinaturaStatus.tsx`, `PaymentFailedGate.tsx` e os banners passam a chamar as funções do Asaas; `src/lib/stripeCheckout.ts` vira `paymentCheckout.ts` (mesma lógica de voltar na mesma aba e sincronizar entre abas); `usePricing` passa a ler os preços do Asaas.
- Stripe: `create-checkout`, `create-pix-checkout`, `customer-portal`, `stripe-webhook`, `check-subscription` e `get-pricing` são desativados; a UI deixa de oferecer o portal do Stripe (gestão de cartão passa a ser feita pelo Asaas). Assinaturas Stripe ativas hoje continuam válidas no banco até o fim do ciclo — nenhuma conta perde acesso na troca.
- CPF/CNPJ é obrigatório no Asaas: o formulário de assinatura pede o documento antes do pagamento (guardado em `business_settings`) quando ainda não houver.
- Testes: novos testes de regressão para o webhook (ativação, atraso, evento repetido), para a leitura de preços do Asaas e para o retorno da tela de sucesso; `bun run test:prepublish` antes de publicar.

## Verificação

- Fluxo completo no ambiente sandbox do Asaas: Pix pago, cartão aprovado, boleto pendente e depois pago — conferindo em cada caso a liberação do acesso e a data do próximo ciclo.
- Simulação dos eventos de atraso e reembolso para confirmar o bloqueio e o aviso ao administrador.
