# Corrigir baixa de pagamento de pacote e o desconto que fica “em aberto”

## O que eu confirmei olhando o app e os dados

- O pacote criado hoje (R$ 900, 5 aplicações) está com **todas as 5 aplicações pendentes, R$ 0 recebido**, e **não existe nenhum lançamento no financeiro nem no caixa** com data de hoje. Ou seja, a baixa que apareceu como feita não ficou gravada em lugar nenhum.
- Quando a baixa dá certo, o desconto é gravado **somente na aplicação em que você deu a baixa**. As outras aplicações do mesmo pacote continuam com desconto zero, então elas mostram o valor do desconto (os R$ 150) como valor em aberto e o pagamento aparece como parcial. Esse é exatamente o erro relatado.
- A tela do agendamento só considera um pacote “quitado” quando o valor recebido chega ao preço cheio do pacote. Com desconto, isso nunca acontece — por isso sobra saldo fantasma.
- Quando o pagamento é enviado, o app calcula o valor do pacote de um jeito e o servidor de outro. Se o vínculo do agendamento com o pacote não vier carregado, o app usa o preço da sessão em vez do preço do pacote, e os valores divergem.
- Se a gravação no financeiro ou no caixa falhar, o servidor **registra o erro mas responde “sucesso”** — o pagamento parece registrado sem aparecer no caixa e no extrato.
- O motivo exato da mensagem de erro que você viu ainda não está identificado: não há registro de chamada nos logs do servidor de pagamento. Investigar isso é o primeiro passo.

## O que vou fazer

1. **Descobrir a causa da mensagem de erro**: instrumentar o pagamento para registrar toda tentativa (inclusive as que falham) e reproduzir a baixa do pacote de R$ 900 com desconto, guardando o motivo real da falha.
2. **Desconto nunca gera valor em aberto**:
   - gravar o desconto em todas as aplicações do mesmo pacote;
   - considerar o pacote quitado quando recebido + desconto cobrem o valor total;
   - garantir que desconto não cria saída de caixa nem parcela pendente a receber.
3. **Um único cálculo de valores**: agenda, tela do agendamento e servidor passam a usar a mesma regra de preço do pacote, desconto e valor restante, reconhecendo o pacote mesmo quando o vínculo vem incompleto.
4. **Baixa atômica e honesta**: se o lançamento no financeiro ou no caixa falhar, a operação falha com mensagem clara em vez de dizer “sucesso”; ao repetir a tentativa, nada é duplicado.
5. **Financeiro e caixa em tempo real**: a baixa de pacote passa a gerar/atualizar o registro correspondente e as telas de Caixa, Extrato, Contas a Receber e Pacotes se atualizam na hora.
6. **Corrigir o “Total recebido” dos pacotes**: recebido passa a somar apenas o que realmente entrou (parcelas com baixa e pagamentos confirmados), e conferir/limpar o pacote que aparece com R$ 300 recebidos sem nenhuma baixa.
7. **Testes de regressão** cobrindo: desconto total, desconto parcial, pagamento parcial, pacote com boleto, e repetição da mesma baixa; mais typecheck, testes e build.

## Detalhes técnicos

- `supabase/functions/process-payment/index.ts`: propagar `discount_amount` na atualização dos irmãos (`package_appointments` → `appointments`); derivar status por `resolvePayment`/`derivePaymentStatus` compartilhado; não criar `financial_entries` pendente quando o restante for só desconto; retornar erro quando `financial_entries`/`cash_transactions` falharem; idempotência por `appointment_id` + valor (evitar duplicar lançamento em retry).
- `src/pages/Agenda.tsx` (`handlePayment`) e `src/components/appointments/AppointmentDetailDialog.tsx`: detectar pacote também por `package_name_snapshot`/notas, usar `total_price` do pacote resolvido e considerar `amount_paid + discount_amount >= total` como pago.
- `src/components/financeiro/PacotesFinanceiro.tsx` + `src/lib/packageReceivedAmount.ts`: recebido = parcelas pagas ou pagamento confirmado; auditar a venda com `paid_at` indevido.
- `src/hooks/useAppointments.ts`: manter invalidação de `financial_entries`, `cash_transactions`, `package-sales-financial` e relatórios após a baixa.
- Testes novos em `src/lib/__tests__/` e `src/__tests__/regression/`.
