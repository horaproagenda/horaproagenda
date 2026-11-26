# Conversões de medida corretas no custo por atendimento

## O que encontrei
- **ml e litros, g e kg:** a conversão está certa. 500 ml num produto estocado em litros vira 0,5 l, e o preço usa o valor por litro.
- **ml e kg (o Gel, em 21 vínculos):** aqui está o erro. O app guarda certo o consumo, que é 0,5 kg para cada 500 ml. Mas, em algumas contas da tela, essa conversão não existe: o número em ml fica sem conversão ou o produto aparece sem custo. O mesmo acontece com g e litros.
- **Contas que escondem o problema:** algumas telas, quando não conseguem converter, usam o número original. Assim, 500 ml podem ser contados como 500 kg, e o custo fica mil vezes maior. Isso acontece em três lugares: o cálculo dos vínculos de produtos, a estatística dos ciclos e o registro de ciclo.

## Correção
1. **Uma regra só de conversão para custo e estoque:**
   - Dentro da mesma família: ml e l, g e kg (e mg).
   - Entre volume e peso: 1 ml = 1 g, a mesma regra que o banco já usa para baixar o estoque do Gel.
   - "un" só se converte para "un".
2. **Fim do "usar o número cru":** quando duas medidas realmente não se convertem (ex.: un e ml), o app mostra o aviso "Medida incompatível com o estoque", em vez de inventar um valor.
3. **Precificação:** a média dos ciclos e o cálculo "recipiente ÷ atendimentos" passam a converter também entre ml e kg e entre g e litros. O preço por unidade continua vindo da compra mais recente, na unidade do estoque.

Nada salvo é alterado: as quantidades gravadas já estão certas, só o cálculo na tela muda.

## Detalhes técnicos
- `src/lib/productStock.ts`: `convertQuantity` passa a usar também `CROSS_FAMILY_DENSITY_1`, que já está definida mas não é usada, e incluir mg↔ml.
- Remover os `?? value` / `?? sp.container_amount` silenciosos em `productCycleAnalytics.ts`, `ServiceProductsDialog.tsx` (3 pontos) e `ProductDetailDialog.tsx` (831, 867). Quando a conversão der null, mostrar um aviso e não gravar nem calcular.
- `productCostCalculation.ts`: nova issue `incompatible_unit`, com o rótulo na Precificação, no lugar do fallback para `storedQty`.
- Testes: 500 ml→0,5 kg, 250 g→0,25 l, 500 ml→0,5 l, un↔ml = null, Gel 500 ml/7 atendimentos a R$ X/kg com o custo esperado, e um vínculo incompatível que gera o aviso.
