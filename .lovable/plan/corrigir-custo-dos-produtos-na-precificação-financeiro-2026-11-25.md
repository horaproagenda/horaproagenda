# Corrigir custo dos produtos na Precificação (Financeiro)

## O que já confirmei no código
- A tela de Precificação calcula o custo do produto de dois jeitos diferentes:
  - No detalhe de um serviço/pacote ("Composição de custos"), usa o cálculo unificado (preço por unidade de estoque, conversão ml/l e g/kg, modo estimado por recipiente).
  - Na tabela "Todos os serviços", usa uma conta antiga: `preço unitário x quantidade por uso`, sem conversão nem modo estimado. Por isso o mesmo serviço mostra custos diferentes conforme onde se olha.
- O preço usado vem só do cadastro do produto (`total_price / quantity_purchased`, ou `unit_price`). Se o preço da compra mais recente for diferente do cadastro, o custo fica desatualizado.

## Ainda não confirmado (o banco estava indisponível agora)
- Se os valores errados que você viu vêm de produtos com preço/quantidade comprada vazios ou divergentes, ou de vínculos no modo "estimado" sem recipiente informado. Primeiro passo: conferir esses dados nos seus produtos vinculados.

## O que vou fazer
1. Conferir no banco os produtos vinculados a serviços/pacotes: preço, quantidade comprada, unidade, compras recentes e modo de rastreio; identificar exatamente qual caso gera o valor errado.
2. Fazer a tabela "Todos os serviços" usar o mesmo cálculo da Composição de custos (uma única regra em todo lugar).
3. Usar o preço por unidade da compra mais recente do produto quando existir; sem compra, usar o cadastro.
4. Na Composição de custos, mostrar por produto: quantidade por uso, unidade e preço por unidade usado, e um aviso claro quando faltar preço ou quantidade (em vez de mostrar R$ 0,00 em silêncio).
5. Produtos de uso geral (limpeza, café) continuam fora do custo por atendimento.
6. Teste automático garantindo que a tabela e o detalhe dão o mesmo valor, incluindo conversão ml/l e modo estimado.

## Detalhes técnicos
- `src/components/financeiro/PrecificacaoServicos.tsx`: `allServicesAnalysis` passa a usar `calculateProductLinkCostPerUse`.
- `src/lib/productCostCalculation.ts`: aceitar preço da última compra (`product_purchases`) com prioridade; expor motivo quando custo = 0.
- Novo teste em `src/__tests__/regression/`.
