# Corrigir o registro de uso na página de Produtos

## Objetivo
Manter quantidade, grandeza, início, término, duração, situação e baixa no estoque vinculados ao mesmo registro de uso, com atualização imediata na página de Produtos.

**Sua escolha:** registrar somente as datas, sem horários. A duração será calculada automaticamente em dias, considerando início e término inclusivos: começar e terminar no mesmo dia corresponde a 1 dia de uso. Não serão inventados horários nem exibida duração em segundos.

## Diagnóstico confirmado
- O banco mantém datas e quantidade de uso em `products` e `product_purchases`; `product_usage_records` é criado apenas no encerramento. Ainda não há um registro único acompanhando todo o ciclo.
- A consulta atual encontrou 21 produtos com início sem término, 13 compras nessa situação e nenhum registro no histórico `product_usage_records`. As contagens, sozinhas, não permitem decidir quais dados devem ser corrigidos.
- Existe uma compra com término anterior ao início; ela precisa de revisão, sem inventar a data correta.
- As operações de início e término já são transacionais, e existe um índice único por ciclo no histórico. Essas proteções serão preservadas e ampliadas, não descartadas.
- A operação de início permite atualizar uma compra já iniciada quando seu identificador é enviado, sem uma operação específica de correção nem controle de versão.
- O encerramento recebe da tela os atendimentos e suas datas; a nova operação deverá conferir esses dados no servidor antes de calcular o consumo.

## Correções

### 1. Um registro para todo o uso
- Criar o registro antes do início e manter o mesmo identificador até o encerramento.
- Guardar quantidade, grandeza, datas, duração calculada, situação e versão nesse registro.
- Controlar as situações **Planejado**, **Em uso**, **Concluído** e **Cancelado**. Cancelamento exige motivo.
- Impedir término sem início, término anterior ao início, quantidade inválida, quantidade acima do estoque e mais de um ciclo ativo por produto.
- Não iniciar outro ciclo nem encerrar o anterior automaticamente sem confirmação.

### 2. Início e término seguros
- Iniciar sem descontar a quantidade do estoque; respeitar a data escolhida manualmente.
- Finalizar gravando, na mesma transação, término, duração, atendimentos válidos, médias, consumo por dia, movimentação de estoque e situação concluída.
- Descontar exatamente a quantidade do ciclo, com conversões somente entre grandezas compatíveis.
- Repetir a finalização retorna o resultado já salvo, sem novo consumo nem nova baixa.
- Impedir que duas pessoas sobrescrevam o mesmo registro sem aviso, usando controle de versão.

### 3. Correções de datas e estoque com histórico
- Substituir alterações independentes das datas por operações controladas do registro de uso.
- Não apagar ou reabrir um uso concluído por simples limpeza de campo. Exigir confirmação e motivo para correção, com recálculo e compensação de estoque quando necessários.
- Registrar criação, início, término, correção, cancelamento e ajuste de estoque, incluindo responsável e valores anteriores e novos.
- Conferir edição e exclusão de compras relacionadas para impedir baixa repetida ou consumo órfão; preservar o histórico do uso.
- Manter reposição/ajuste de estoque separado de consumo, sem transformá-lo em média de uso.

### 4. Página de Produtos sincronizada
- Mostrar ciclo ativo e histórico a partir do registro oficial, sem cópias independentes de datas, duração ou situação.
- Bloquear ações durante a gravação e mostrar sucesso somente após confirmação do servidor.
- Atualizar detalhes, estoque, compras, cartões de consumo e previsões após salvar e por atualizações em tempo real.
- Manter os dados digitados se houver erro e exibir mensagens claras.
- Preservar o fluxo de iniciar uma nova quantidade após o término, sempre com confirmação.

### 5. Auditoria dos registros anteriores
- Comparar os registros reais de produto, compra, consumo e histórico antes de qualquer alteração.
- Migrar para o registro único somente informações comprovadas, preservando quantidade, grandeza e datas manuais.
- Não inventar término, quantidade ou consumo ausentes e não repetir baixas antigas.
- Separar casos ambíguos para revisão e registrar cada correção realizada; não alterar silenciosamente registros concluídos.

## Parte técnica
- Evoluir `product_usage_records` para suportar todo o ciclo, mantendo compatibilidade com histórico, médias e previsões existentes. Produto e compra passam a ser apenas referências/espelhos quando necessário.
- Usar campos `DATE` para início e término; datas de auditoria continuam com horário. Exibir datas sem conversão que desloque o dia.
- Centralizar criação, início, finalização, correção e cancelamento em operações transacionais do Supabase, com bloqueio de linha, versão e idempotência por registro.
- Validar transições e calcular duração no banco; apurar atendimentos concluídos e autorizados no servidor, sem confiar na lista enviada pela tela.
- Preservar o isolamento entre clínicas e profissionais, verificando permissão em cada operação. Qualquer nova tabela terá privilégios explícitos e políticas de acesso.
- Alterações estruturais serão feitas por migração; reconciliação dos dados existentes será feita separadamente, com auditoria.
- Registrar a fonte única do ciclo nas regras de arquitetura e atualizar testes de proteção do fluxo.

## Validação obrigatória
- Estoque 600, uso 100: iniciar mantém 600; finalizar deixa 500; finalizar novamente mantém 500 e um único consumo.
- Início 14/10 e término 14/10: duração 1 dia; término 13/10 é recusado.
- Quantidade 100 e 40 atendimentos concluídos: média 2,5; cancelados e faltas não contam. Sem atendimentos, não criar média fictícia.
- Duas tentativas simultâneas não criam dois ciclos nem duas baixas; versão desatualizada não sobrescreve dados.
- Correção autorizada substitui os lançamentos do ciclo, sem duplicação, preservando os valores anteriores na auditoria.
- Fechar e reabrir o produto mantém as datas salvas; atualização por outro usuário aparece sem recarregar.
- Validar os testes de produtos, estoque, permissões e sincronização, além de conferir o fluxo pela página de Produtos em computador e celular com uma conta autorizada. Não declarar validação real de acesso restrito sem conseguir entrar nessa conta.

## Limites
Não alterar agenda, pagamentos ou horários de clientes. Não haverá publicação automática, horários de uso nem baixa de estoque em registros reais apenas para teste.