# Ciclo de uso por quantidade parcial (ex.: 100 de 600 palitos)

## Objetivo
Quando o produto é registrado com "não sei a quantidade exata que uso em cada atendimento" e vinculado a serviços/pacotes, o app deve:

1. Permitir informar **qual quantidade está em uso agora** (ex.: 100 unidades das 600 compradas) junto com a data de início do uso.
2. Ao registrar a **data de término** dessas 100 unidades, mostrar e salvar:
   - quantos atendimentos (serviços e pacotes) foram feitos com essas 100 unidades;
   - média de unidades por atendimento (100 ÷ atendimentos);
   - duração em dias das 100 unidades;
   - projeção: quanto tempo e quantos atendimentos as 600 unidades totais devem durar.
3. Avisar automaticamente quando o total (600) estiver perto de acabar, com base nessa média real.

## Situação atual (verificada)
- O ciclo de uso hoje é derivado do "recipiente" (`container_amount` dos vínculos de serviço/pacote). Para produtos contados em unidades isso é confuso: não existe campo para "quantidade em uso neste ciclo".
- `product_purchases` guarda `quantity`, `started_using_at`, `finished_at`, `duration_days`, mas não a quantidade parcial em uso.
- O encerramento do ciclo (`ProductDetailDialog`) calcula atendimentos e desconta estoque, mas não apresenta um resumo de médias nem projeção do total comprado.
- As previsões (`useProductUsagePrediction`) usam apenas compras finalizadas e a tabela de consumo por atendimento; não usam a média por atendimento obtida do ciclo parcial.

## O que será feito

### 1. Banco de dados
Migração em `product_purchases`:
- `cycle_quantity numeric NULL` — quantidade colocada em uso no ciclo (ex.: 100).
- `cycle_appointments integer NULL` — atendimentos concluídos no ciclo (gravado ao encerrar).
- `avg_quantity_per_appointment numeric NULL` — média calculada no encerramento.
Sem novas tabelas; políticas RLS e grants existentes de `product_purchases` continuam valendo.

### 2. Início do uso (Produtos > detalhe do produto)
- No fluxo "Iniciar uso hoje" / informar data de início, quando o produto está em modo estimado (quantidade por atendimento desconhecida), exibir campo obrigatório **"Quantidade em uso neste ciclo"** com a nomenclatura correta da unidade (unidades / ml / g), pré-preenchido com o estoque atual e limitado a ele.
- Gravar em `product_purchases.cycle_quantity` (criando a linha de ciclo quando não houver compra ativa).
- O painel "Ciclo atual" passa a mostrar: quantidade em uso, data de início, dias corridos e atendimentos já realizados nos serviços/pacotes vinculados.

### 3. Encerramento do uso (data de término)
Pré-visualização e confirmação passam a mostrar um resumo claro:
- período (início → término) e duração em dias;
- atendimentos concluídos no período, separados por serviço e por pacote;
- **média por atendimento** = quantidade em uso ÷ atendimentos;
- **média de dias por unidade** e duração média por atendimento;
- **projeção do total**: com essa média, quantos atendimentos e quantos dias o estoque restante (e o total comprado) ainda cobre;
- quantidade descontada do estoque e estoque restante.

Ao confirmar:
- grava `cycle_appointments` e `avg_quantity_per_appointment` no ciclo;
- atualiza `quantity_per_use` dos vínculos estimados de serviço e de pacote com a média real (hoje só serviços são atualizados);
- desconta a quantidade em uso do estoque total;
- oferece iniciar o próximo ciclo com a quantidade restante.

### 4. Previsão e alerta de estoque baixo
- `useProductUsagePrediction` passará a usar, como fonte prioritária, `avg_quantity_per_appointment` e a duração dos ciclos encerrados do próprio produto (média ponderada dos últimos ciclos) para calcular:
  - atendimentos restantes = estoque atual ÷ média por atendimento;
  - dias restantes = atendimentos restantes ÷ ritmo diário de atendimentos.
- Mensagens em português claro, sem termos técnicos, ex.: "Palitos: ~120 atendimentos (~45 dias) restantes. Compre mais quando chegar a 30 dias."
- Alerta de estoque baixo dispara por qualquer um dos critérios: estoque ≤ mínimo, atendimentos restantes baixos, ou dias restantes ≤ 14 (mantendo o envio já existente por WhatsApp/toast em `useStockAlertNotifications`).

### 5. Testes
- Testes unitários novos para o cálculo do ciclo (média por atendimento, duração, projeção do total, arredondamentos e conversão de unidades) e para a prioridade da média real sobre a estimativa.
- Rodar a suíte existente de produtos/estoque para garantir que nada regrediu.

## Detalhes técnicos
- Arquivos: `src/components/produtos/ProductDetailDialog.tsx` (campos e resumo do ciclo), novo `src/lib/productCycleAnalytics.ts` (cálculos puros + testes), `src/hooks/useProductUsagePrediction.ts`, `src/hooks/useProducts.ts` (tipos de compra), `src/components/produtos/ProductUsagePredictionPanel.tsx` (exibir médias e projeção), `src/hooks/useStockAlertNotifications.ts` (novo critério de dias restantes).
- Conversões de unidade continuam usando `src/lib/productStock.ts`.
- Pacotes contam via `package_appointments`/agendamentos vinculados aos templates com produto, além dos serviços vinculados.
