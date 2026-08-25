# Corrigir webhook do Asaas e revisar integração de assinatura

Objetivo: parar a penalização 401 do webhook do Asaas, manter a validação segura e garantir que pagamento confirmado libere o acesso em tempo real.

## Diagnóstico confirmado

- A URL usada pelo Asaas chega no endpoint correto: `https://nsgcllrbswodjoadybsj.supabase.co/functions/v1/asaas-webhook`.
- O webhook atual valida o cabeçalho `asaas-access-token` contra o segredo `ASAAS_WEBHOOK_TOKEN`.
- Uma chamada com token incorreto retorna `401 Unauthorized`, que é exatamente o erro mostrado no painel do Asaas.
- Os segredos `ASAAS_API_KEY`, `ASAAS_ENV` e `ASAAS_WEBHOOK_TOKEN` existem no projeto, mas seus valores ficam ocultos por segurança; então a correção precisa alinhar o token salvo no Lovable/Supabase com o token configurado no painel do Asaas.

## Correções planejadas

1. **Corrigir a autenticação do webhook**
   - Manter o webhook protegido por token.
   - Aceitar o cabeçalho oficial `asaas-access-token` e também variações seguras comuns, como `Authorization: Bearer ...`, para evitar falhas por configuração de cabeçalho.
   - Melhorar os logs para distinguir: token ausente, token divergente e segredo não configurado.
   - Não aceitar requisições sem token válido, para evitar eventos falsos liberando acesso.

2. **Alinhar o token com o painel do Asaas**
   - Abrir o formulário seguro para atualizar `ASAAS_WEBHOOK_TOKEN`, caso o token cadastrado no Asaas não seja exatamente o mesmo salvo no app.
   - Depois da atualização, reimplantar o webhook e testar chamadas com token inválido e com o token correto.

3. **Revisar processamento dos eventos do Asaas**
   - Confirmar que eventos pagos (`PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`) ativam a assinatura e atualizam vencimento, assentos e vínculo do pagamento.
   - Confirmar que eventos vencidos/cancelados/reembolsados atualizam o status sem quebrar o acesso indevidamente.
   - Garantir idempotência: evento repetido não deve processar duas vezes.

4. **Corrigir pontos restantes da troca Stripe → Asaas**
   - Remover textos e decisões de UI que ainda dependem de campos Stripe nas telas/banners de assinatura.
   - Ajustar o estado de acesso para considerar `payment_provider = 'asaas'`, `asaas_customer_id` e `asaas_subscription_id` quando existir cobrança pendente ou assinatura ativa.
   - Revisar lembretes/rotinas de assinatura que ainda consultam Stripe para que não tentem sincronizar preço ou cobrança pelo provedor antigo.

5. **Verificação final**
   - Testar o webhook publicado com:
     - token ausente/incorreto: deve negar;
     - evento sem conta identificada: deve responder sem liberar acesso;
     - evento pago válido: deve ativar a assinatura correta;
     - evento repetido: deve ser ignorado.
   - Conferir logs da Edge Function após os testes.
   - Validar no app: tela de sucesso, status da assinatura, fatura pendente e banners de pagamento.

## Informação para configurar no Asaas

- **URL do webhook:** `https://nsgcllrbswodjoadybsj.supabase.co/functions/v1/asaas-webhook`
- **E-mail para notificações de erro:** `suporte@horaproagenda.tech`
- **Token de autenticação:** deve ser exatamente o mesmo valor salvo no segredo `ASAAS_WEBHOOK_TOKEN`.

## Observação técnica

Não será usado `app.post('/api/webhooks/asaas', express.json(), ...)`, porque este projeto não roda um servidor Express persistente. O equivalente correto aqui é a Edge Function Supabase `asaas-webhook`, que já recebe as requisições externas do Asaas.
