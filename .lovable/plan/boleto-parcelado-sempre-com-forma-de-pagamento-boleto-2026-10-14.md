# Boleto parcelado sempre com forma de pagamento "Boleto"

## Objetivo
Toda parcela de venda feita por boleto, ao receber baixa, fica automaticamente com a forma de pagamento "Boleto Bancário", e não dá para trocar por outra.

## O que muda
1. **Baixa da parcela**: ao dar baixa (individual ou em lote, no Financeiro ou no Caixa), a parcela recebe sozinha a forma "Boleto Bancário" da clínica.
2. **Sem troca**: se alguém tentar gravar outra forma (cartão, Pix etc.) numa parcela de boleto, o sistema troca de volta para Boleto. Nas telas de edição desses lançamentos, o campo de forma aparece travado mostrando "Boleto Bancário".
3. **Venda com forma boleto**: qualquer venda registrada com forma de pagamento boleto passa a ter todos os seus recebimentos ligados ao Boleto.
4. **Registros antigos**: as 17 parcelas de boleto já pagas e sem forma de pagamento recebem "Boleto Bancário" (Iago Henrique, Luiza Amélia, cadastro teste). Nada além disso é alterado.
5. **Se faltar a forma Boleto** na clínica, ela é criada automaticamente no momento da baixa, em vez de bloquear.

## Detalhes técnicos
- Trigger em `financial_entries` (substitui o atual `enforce_payment_method_on_paid_income`): se `notes` contém `[boleto:` ou a venda vinculada (`sale_id`) tem forma boleto ou possui `boleto_installments`, força `payment_method_id` = método "Boleto" do dono da conta (cria se não existir); demais casos mantêm a regra de forma obrigatória.
- `boletoFinancialSync.ts`: resolve e envia o método boleto explicitamente.
- Telas de edição de lançamento (`ContasAReceber`, extrato): selector desabilitado quando lançamento é de boleto.
- Backfill das 17 parcelas pagas sem forma.
- Teste: helper puro `resolveBoletoPaymentMethod` (parcela de boleto → sempre boleto, mesmo com outra forma informada).
