# Pacotes vendidos precisam aparecer no Financeiro

## Causa confirmada

A aba **Financeiro > Pacotes** lista apenas registros de venda (`single_sales` com tipo "pacote").
Quando o pacote é vendido pelo Caixa, esse registro é criado. Já quando o pacote comum ou
sequencial é criado direto pelo formulário da agenda (ou pelo perfil do cliente), a rotina
que cria o pacote grava só o pacote e as sessões — nenhum registro de venda. Por isso o
pacote existe, aparece no perfil da cliente e na agenda, mas nunca aparece no Financeiro.

Confirmações nos dados:
- pacotes de cliente criados recentemente sem nenhuma venda vinculada;
- existe um registro de venda de pacote sem pacote vinculado (venda órfã de 29/08), que
  também precisa ser regularizado.

Efeito colateral já conhecido: pacote sem venda é tratado como "órfão" pelas rotinas de
integridade, o que já causou exclusões automáticas no passado.

## O que será feito

### 1. Pagamento no formulário do pacote
No formulário de pacote (agenda e perfil do cliente), um bloco novo "Pagamento do pacote":
- **Já foi pago** → escolher forma de pagamento e data; a venda é registrada como paga.
- **Pendente** (padrão) → a venda é registrada com valor total e recebido R$ 0.

Nada é lançado no caixa pelo formulário da agenda: a movimentação de dinheiro continua
sendo feita no Caixa/Financeiro, como hoje. Marcar "já foi pago" apenas registra a venda
como quitada e libera as sessões como pagas.

### 2. Criação do pacote passa a registrar a venda
A criação do pacote e o registro da venda passam a acontecer numa única operação:
pacote + sessões + venda. Se o registro da venda falhar, nada é criado e o usuário recebe
aviso claro para tentar novamente — em vez de ficar com um pacote invisível no Financeiro.

O registro da venda guarda: cliente, pacote, nome do pacote, valor total, desconto,
forma de pagamento, data da venda e se está pago.

### 3. Regularizar os pacotes antigos
Uma rotina de correção cria o registro de venda pendente para todo pacote de cliente
existente que não tenha venda, usando o valor e a data de criação do próprio pacote.
Pacotes com forma de pagamento já preenchida são registrados como pagos.
A venda órfã sem pacote vinculado é marcada como cancelada/arquivada para não poluir a lista.
Nenhum dado é apagado.

### 4. Ferramentas para o fluxo continuar correto
- Verificação automática em segundo plano: pacote sem venda passa a ser regularizado
  (registro de venda pendente criado), nunca apagado.
- Painel de consistência de pacotes ganha a checagem "pacote sem registro no Financeiro",
  com botão para regularizar.
- Atualização em tempo real: criar um pacote na agenda já reflete na aba Pacotes,
  no Relatório e no Extrato sem recarregar.
- Filtro na aba Pacotes para ver também concluídos e cancelados (hoje eles desaparecem
  da lista e só abrem por link direto).

## Testes

- Regressão: criar pacote comum e sequencial pela agenda gera exatamente um registro de
  venda vinculado ao pacote; o teste falha se o registro deixar de ser criado.
- Regressão: a rotina de integridade nunca apaga pacote sem venda — apenas regulariza.
- Cálculo do valor recebido e do pendente para pacote pago e pendente.
- Verificação prática no app: criar pacote sequencial pela agenda, abrir Financeiro > Pacotes
  e confirmar que ele aparece com valor total, recebido e sessões corretos.

## Detalhes técnicos

- `src/hooks/useClientPackages.ts` → `createClientPackage` passa a inserir `single_sales`
  (`item_type: 'package'`, `package_id`, `client_id`, `original_amount`/`final_amount`,
  `payment_method_id`, `sale_date`, `paid_at`) na mesma operação, com rollback do pacote
  em caso de falha; novos parâmetros `payment` (`{ isPaid, paymentMethodId, saleDate }`).
- `src/components/appointments/NewAppointmentDialog.tsx`: bloco de pagamento do pacote e
  repasse ao hook; `isPackagePaid` passa a derivar da venda.
- Migração: função `heal_packages_without_sale()` (idempotente, `SECURITY DEFINER`,
  escopo por `account_owner_id`) + backfill único; ajuste em `heal_orphan_service_packages()`
  para regularizar em vez de considerar órfão.
- `src/hooks/useSaleFlowIntegrityAutoCheck.ts`: chama a regularização.
- `src/components/financeiro/PacotesFinanceiro.tsx`: filtro de status e invalidação realtime.
- `src/components/caixa/PackageConsistencyReport.tsx`: nova checagem + ação.
- Testes em `src/lib/__tests__/` e `src/__tests__/regression/`; registrar em
  `docs/protected-behaviors.md`.
