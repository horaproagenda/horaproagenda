# Corrigir sobreposição dos valores no recibo em PDF

## Causa confirmada
No recibo do agendamento, quando existe desconto, a linha **“Total final”** é desenhada em `finalY + 48` e a linha **“Valor pago”** em `finalY + 49`. A distância de apenas 1 mm faz os dois textos ocuparem praticamente a mesma posição, exatamente como no print. Sem desconto, a distância atual é de 9 mm, por isso o defeito aparece nesse cenário específico.

## Alterações
1. **Organizar o resumo financeiro com posição sequencial**
   - Substituir os deslocamentos fixos independentes por um único cursor vertical.
   - Avançar o cursor após cada linha: valor original, adicionais, desconto, forma de pagamento, total final e valor pago.
   - Manter destaque visual no “Total final” e deixar “Valor pago” claramente abaixo, sem sobreposição.

2. **Proteger recibos com muitos itens**
   - Antes de desenhar o resumo, verificar o espaço restante na página.
   - Criar uma nova página quando o bloco final não couber inteiro, evitando cortes ou sobreposição com o rodapé.

3. **Adicionar proteção contra regressão**
   - Criar teste para recibo com desconto, confirmando distância vertical segura entre “Total final” e “Valor pago”.
   - Cobrir também recibo sem desconto e resumo próximo ao fim da página.

4. **Validar o resultado**
   - Executar o teste específico e a verificação do projeto.
   - Gerar um PDF de exemplo com desconto, renderizá-lo como imagem e inspecionar visualmente o bloco final.

## Resultado esperado
O recibo mostrará **Total final: R$ 20,00** e **Valor pago: R$ 20,00** em linhas separadas e legíveis, inclusive quando houver desconto e muitos itens.
