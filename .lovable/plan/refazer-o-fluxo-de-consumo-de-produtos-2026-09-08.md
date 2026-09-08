# Refazer o fluxo de consumo de produtos

O fluxo de "não sei a quantidade exata" hoje tem três controles paralelos disputando o mesmo número, e o resultado é conta errada e painel que não atualiza. A proposta é reduzir tudo a um caminho único: quantidade separada para uso → data de início → data de término → consumo calculado e estoque abatido.

## O que está errado hoje (verificado no código)

- A quantidade em uso é guardada em dois lugares (no produto e na compra) e ainda existe uma terceira quantidade no vínculo com o serviço/pacote. Quando um deles está vazio, o encerramento cai numa regra de emergência que desconta a compra inteira ou até todo o estoque, em vez das 100 unidades informadas.
- O painel "Registro de consumo — Hoje / Semana / Mês / Semestre / Ano" lê apenas os lançamentos diários de consumo (`product_daily_consumption`). Encerrar o uso não cria nenhum lançamento ali, então esses números continuam parados depois de registrar início e término — exatamente o sintoma relatado.
- Ao encerrar, o app sobrescreve a quantidade por atendimento dos vínculos, misturando o histórico de um ciclo com a configuração do serviço.

## Fluxo correto a implementar

1. **Vínculo com serviço/pacote** — ao escolher "não sei a quantidade exata", informa-se apenas: quantidade separada para uso (ex.: 100) e a grandeza (mg, g, kg, ml, L, unidade). Nada mais é pedido, e nenhuma média é inventada nesse momento.
2. **Início do uso** — registra a data em que aquelas 100 unidades começaram a ser usadas. A quantidade em uso passa a ficar em um único lugar (o ciclo), e o estoque total continua intacto.
3. **Término do uso** — registra a data final. O app então calcula, para o período (início até término, inclusive) e apenas para os serviços/pacotes vinculados àquele produto, ignorando cancelados e faltas:
   - atendimentos realizados;
   - dias de duração;
   - média consumida por atendimento = quantidade em uso ÷ atendimentos;
   - ritmo por dia e previsão de quantos atendimentos/dias o estoque restante cobre.
4. **Registro de consumo** — o encerramento passa a gravar o consumo por data: a quantidade em uso é distribuída pelos atendimentos do período, cada um na sua data. Assim os cartões Hoje / Semana / Mês / Semestre / Ano passam a refletir o ciclo imediatamente, e o painel se atualiza em tempo real sem recarregar. Se o ciclo for corrigido ou apagado, os lançamentos daquele ciclo são substituídos, nunca somados em dobro.
5. **Estoque** — o abatimento é exatamente a quantidade informada no início do uso: 600 em estoque, 100 em uso, encerra e sobra 500. Nunca a compra inteira, nunca o estoque todo. O desconto acontece uma única vez por ciclo, mesmo que o botão seja clicado duas vezes.

## Regras de segurança do cálculo

- Grandezas só se combinam dentro da mesma família (massa com massa, volume com volume, unidade com unidade). Fora disso o app avisa em vez de somar valores incompatíveis.
- Sem atendimentos no período: o ciclo é encerrado, o estoque é abatido, mas nenhuma média falsa é apresentada — aparece "sem atendimentos no período".
- Quantidade em uso maior que o estoque é bloqueada na hora do registro, com aviso claro.
- Um ciclo em aberto por produto; iniciar um novo exige encerrar o anterior.

## Parte técnica

- Fonte única do ciclo: usar `product_usage_records` como registro do ciclo (quantidade, unidade, início, término, atendimentos contados, média, ids dos atendimentos já contabilizados) e deixar `products.cycle_quantity` / `product_purchases.cycle_quantity` apenas como espelho de leitura, alimentado a partir do ciclo.
- `src/lib/productCycleAnalytics.ts` e `src/lib/productStockFlow.ts` passam a receber somente a quantidade do ciclo; remover os caminhos de emergência de `resolveCycleDeduction` que consomem a compra ativa ou o estoque inteiro (mantendo o limite de nunca ficar negativo).
- Nova função pura para distribuir a quantidade do ciclo entre as datas dos atendimentos, com sobra atribuída ao último atendimento (soma fecha exatamente com a quantidade informada).
- `runEndCycle` em `ProductDetailDialog.tsx` passa a: fechar o ciclo, gravar os lançamentos em `product_daily_consumption` marcados com o ciclo, abater o estoque e parar de sobrescrever `quantity_per_use` dos vínculos.
- Simplificar o formulário de vínculo (`ProductDetailDialog` e `ServiceProductsDialog`) no modo estimado: só quantidade + grandeza.
- Assinatura em tempo real de `product_daily_consumption` e `product_usage_records` para invalidar produtos, consumo e previsões.
- Migração: índice de idempotência por ciclo nos lançamentos de consumo e correção dos dados atuais (ciclos já encerrados sem lançamento ganham seus registros; estoques descontados a mais são recalculados a partir da quantidade de cada ciclo).
- Testes de regressão: 600/100 sobra 500; encerrar duas vezes não desconta duas vezes; média 100÷40 = 2,5; cartões de período somam o ciclo; famílias de grandeza incompatíveis são recusadas.
