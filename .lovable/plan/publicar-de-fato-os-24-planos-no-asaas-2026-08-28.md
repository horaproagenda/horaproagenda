# Publicar de fato os 24 planos no Asaas

Confirmado agora: a tabela local `billing_payment_links` está **vazia** e nenhum link
foi criado no Asaas. O código de sincronização e o painel existem, mas a
sincronização nunca foi executada — ela só roda quando alguém clica em
"Sincronizar planos" no painel do super administrador. Por isso nada apareceu
no Asaas.

## O que será feito

1. Executar a sincronização (`asaas-sync-payment-links`) contra o Asaas de
   produção, criando os 24 links (8 pacotes de usuários × mensal/semestral/anual)
   com cartão de crédito, cartão de débito, Pix e boleto liberados.
2. Conferir o resultado: cada link precisa voltar com `id` e `url` do Asaas e
   ficar gravado em `billing_payment_links` (24 linhas, uma por combinação).
3. Se o Asaas recusar algum item (valor, ciclo ou forma de pagamento não aceita
   na conta), corrigir o campo apontado pela resposta e sincronizar de novo — a
   rotina é idempotente, repetir não duplica link.
4. Depois de tudo criado, validar no painel "Planos no Asaas": os 24 planos
   visíveis com valor, ciclo, status e botão de copiar/abrir o link.

## Detalhes técnicos

- A função exige JWT de `super_admin` (via RPC `is_super_admin`); existe um
  usuário com esse papel na conta.
- Reconciliação pela chave estável `plan:seats:<n>|months:<m>`, procurada no
  `externalReference`, na descrição e, por último, pelo nome do plano.
- Envio ao Asaas: `billingType: "UNDEFINED"` (todas as formas de pagamento),
  `chargeType: "RECURRENT"`, `subscriptionCycle` MONTHLY/SEMIANNUALLY/YEARLY,
  vencimento de 5 dias para boleto/Pix.
- Nada do cadastro no app muda: continua cartão de crédito com teste de 20 dias,
  carência de 2 dias e liberação/suspensão pelo webhook.
