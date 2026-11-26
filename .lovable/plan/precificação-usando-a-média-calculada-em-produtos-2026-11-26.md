# Precificação usando a média calculada em Produtos

## O problema
Quando você marca "não sei a quantidade" e registra o início e o término do produto, o app calcula quanto se gasta por atendimento a cada ciclo encerrado. Ou seja, a média já existe: o Álcool líquido, por exemplo, tem dois ciclos encerrados, com 500 ml em 29 atendimentos e 500 ml em 10.

Só que a Precificação não lê essa média. Ela procura apenas o número "rende quantos atendimentos" no vínculo do produto. Como esse campo está vazio, aparece o aviso "Informe quantos atendimentos o recipiente rende".

## Como vai ficar
Para cada produto do serviço, a quantidade por atendimento vem de:
1. A quantidade exata informada no vínculo, se você informou.
2. A conta "recipiente ÷ atendimentos que rende", se você preencheu.
3. **Novo:** a média dos ciclos encerrados em Produtos, ou seja, o total gasto dividido pelo total de atendimentos, somando os ciclos. Assim, um ciclo curto ou atípico não distorce o resultado. Ciclos cancelados ou ainda em andamento ficam de fora.
4. Se o produto nunca teve um ciclo encerrado, continua o aviso, com um texto mais claro: "Ainda sem ciclo encerrado para calcular a média".

As unidades são convertidas: a média registrada em ml vira litros quando o estoque está em litros, para o preço ficar certo.

Na Composição de custos, cada produto vai mostrar de onde veio a quantidade, por exemplo "Média de 2 ciclos (39 atendimentos)".

Nada salvo é alterado. A tabela "Todos os serviços" usa a mesma regra e continua mostrando o mesmo valor da Composição de custos.

## Detalhes técnicos
- Em `src/lib/productCostCalculation.ts`, `getProductLinkCostDetail` passa a aceitar a média dos ciclos (`{ totalConsumed, appointments, unit, cycles }`) como alternativa, antes de cair em `missing_estimate`. O helper puro `aggregateCycleAverage(records)` soma `total_consumed` e `appointments_counted` dos registros `completed` com mais de zero atendimentos e converte a unidade com `convertQuantity`.
- Em `PrecificacaoServicos.tsx`, uma consulta a `product_usage_records` (status `completed`, por `product_id`) monta o mapa de médias, que é passado aos dois cálculos (Composição e "Todos os serviços"). O detalhe ganha `source: 'link' | 'estimate' | 'cycles'`.
- Testes em `src/lib/__tests__`: média com dois ciclos (500/29 + 500/10 → 1000/39 ml), conversão ml→l, ciclos em andamento ignorados e aviso mantido sem nenhum ciclo.
