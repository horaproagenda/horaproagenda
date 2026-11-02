# Papel lavatório: "Consumo por serviço" mostrando serviços sem vínculo

## Causa raiz (confirmada no banco)
- O Papel lavatório não tem nenhum serviço nem pacote vinculado.
- A regra do sistema para produtos sem vínculo é: contar **todos os atendimentos concluídos no período** como sinal de uso (para calcular média e previsão de recompra).
- Ao encerrar o ciclo de 07/10 a 27/10/2026 (300 un., 21 atendimentos), o encerramento gravou o consumo **dividido por serviço**: as 300 unidades foram rateadas entre os 12 serviços desses 21 atendimentos (ex.: Avaliação 57,14; Axila + Virilha 57,14; Costas 14,29...).
- A tela lê esses registros e mostra o título "Consumo por serviço", dando a impressão de que existem vínculos. Os vínculos nunca existiram; o rateio é que estava errado para produto sem vínculo.

## O que será corrigido
1. **Encerramento de ciclo (banco):** para produto sem vínculo, o consumo passa a ser gravado como uso geral do período (sem atribuir a serviço). Produtos com vínculo continuam como hoje.
2. **Dados já gravados:** marcar como "uso geral" os registros por serviço criados em ciclos de produtos que não tinham vínculo no encerramento (Papel lavatório e qualquer outro produto na mesma situação). Total de unidades, atendimentos, média e datas do ciclo não mudam; nada é apagado, e a correção fica no histórico com motivo.
3. **Tela do produto:** o bloco "Consumo por serviço" só aparece quando há consumo realmente atribuído a serviço. Para produto sem vínculo aparece "Uso geral no período: 21 atendimentos, 300 un., média 14,29 un./atend.".
4. **Teste de regressão:** falha se um produto sem vínculo voltar a exibir ou gravar consumo por serviço.

## Detalhes técnicos
- Ajustar a RPC de encerramento de ciclo (`product_usage_records` → `product_daily_consumption`) para inserir `service_id = NULL` quando o produto não tem `service_products`/`package_template_products`.
- Migração idempotente: `UPDATE product_daily_consumption SET service_id = NULL` para linhas automáticas de ciclos de produtos sem vínculo, com registro em auditoria.
- `productOfficialUsageStats` já ignora linhas sem `service_id`; acrescentar `generalUsage` para o resumo geral.
- Teste em `src/lib/__tests__/productOfficialUsageStats.test.ts`.
