# Produtos: validação da autoridade dos dados

- Consumo manual: operações `record_manual_product_consumption` e `cancel_manual_product_consumption` validam sessão, acesso ao produto, unidade, quantidade e saldo reservado. Quantidade de estoque e auditoria são gravadas na mesma transação; cancelamento não apaga o histórico.
- Funções novas são SECURITY DEFINER porque atualizam estoque/histórico protegidos; acesso anônimo foi revogado, sessão e `_can_manage_product_purchase` + `can_write_record` são conferidos antes de qualquer escrita. Os dois novos avisos de função privilegiada são intencionais e revisados, não exposição pública.
- Histórico de eventos e ciclos não pode ser editado diretamente por `authenticated`. Registros oficiais de consumo têm proteção contra alterações diretas. O legado de vendas continua separado, sem mudanças no Caixa nesta etapa.
- A substituição de consumos de ciclo pela tela não tinha consumidores e foi removida. Finalização/correção existentes geram os registros no servidor.
- Estatísticas por serviço usam consumo e contagens persistidos, não redistribuição de estoque com vínculos atuais. Cartões sem movimentos persistidos não inventam consumo a partir de atendimentos.
- Alteração de unidade com histórico e exclusão de produto com histórico são recusadas. Compras não podem retirar estoque reservado para ciclo planejado/ativo.
- 44 testes unitários e dois testes reais de bloqueio anônimo passaram; compilação automática sem erros. Estes testes não comprovam finalização autenticada nem concorrência real.
- Supabase externo não oferece sessão gerenciada de teste. Fluxo autenticado completo e sincronização entre contas permanecem pendentes de ambiente isolado autorizado. Não foram solicitadas senhas, realizadas baixas reais para teste ou publicada a aplicação.
- Registros antigos sem quantidade/datas confiáveis não foram reconciliados nesta etapa.