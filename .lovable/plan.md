# Produtos: servidor como fonte oficial

## Escopo
Concluir a correção **somente na página Produtos**, alinhando servidor, banco e telas. Não ampliar esta etapa para agenda, vendas, pagamentos ou outros módulos.

## Situação conferida
- Início, finalização, correção do ciclo e ajuste auditado já são chamados pela tela por operações do servidor; essas funções existem no banco.
- Registro, edição e exclusão de compras também usam operações do servidor.
- O consumo manual ainda grava o consumo e altera o estoque em chamadas separadas. Sua exclusão também remove o registro e devolve o estoque separadamente.
- Há um caminho de substituição do consumo do ciclo que apaga e insere lançamentos pela tela; será conferido se ainda é utilizado antes de substituí-lo ou removê-lo.

## Correções
### 1. Conferir e completar a autoridade no banco
- Revisar as operações existentes, permissões, validações, bloqueios de concorrência e caminhos alternativos de escrita de Produtos.
- Manter o registro de uso como autoridade para quantidade, unidade, datas, duração e situação; produto e compra não poderão sobrescrever o ciclo silenciosamente.
- Conferir cadastro, edição, compras e ajustes para impedir alterações de estoque ou datas que contornem as operações oficiais.
- Preservar acesso separado entre clínica e profissionais, com validação no servidor em cada ação.

### 2. Consumo manual em uma única operação
- Registrar consumo e baixa de estoque na mesma transação, com identificação da solicitação para impedir duplicação em nova tentativa.
- Cancelar um consumo manual com motivo e histórico, devolvendo somente a quantidade efetivamente descontada, uma única vez.
- Validar quantidade positiva, unidade compatível, saldo disponível e permissão antes de gravar.
- Diferenciar consumo manual de consumo calculado pelo ciclo; cancelar um lançamento calculado não poderá devolver estoque indevidamente.
- Gerar ou substituir os consumos do ciclo pelo servidor a partir do registro oficial, sem apagar e recriar registros em chamadas independentes da tela.

### 3. Datas, duração e estoque coerentes
- Usar somente datas no uso; duração inclusiva calculada no banco: início e término no mesmo dia correspondem a um dia.
- Preservar datas escolhidas manualmente; recusar término anterior ao início e correções silenciosas de ciclos concluídos.
- Confirmar que iniciar não baixa estoque e finalizar baixa apenas uma vez, mesmo com repetição ou ações simultâneas.
- Conferir que alterações e exclusões de compras vinculadas preservam o histórico e não causam nova baixa.

### 4. Telas alinhadas ao resultado oficial
- Mostrar datas, duração, situação, estoque e histórico a partir das respostas do servidor, sem gravar cópias independentes.
- Mostrar sucesso somente após confirmação; bloquear duplo envio e preservar os campos digitados em caso de erro.
- Atualizar detalhes, compras, consumo e previsões após gravação e por sincronização em tempo real.
- Manter mensagens claras, sem códigos de erro expostos.

## Validação
- Estoque 600 e ciclo 100: iniciar mantém 600; finalizar deixa 500; repetir mantém 500.
- Consumo manual 20 sobre estoque 600: registrar deixa 580; repetir não muda; cancelar devolve para 600 uma única vez.
- Início e término em 14/10: duração de um dia; término em 13/10 é recusado.
- Versão antiga não sobrescreve correção mais recente; duas solicitações simultâneas não duplicam consumo.
- Conta sem permissão não lê nem altera produtos de outra conta.
- Fechar e reabrir os detalhes mantém os dados; alteração autorizada aparece em outra sessão sem recarregar.
- Adicionar e executar testes de regressão dos caminhos alterados. Validar pelas telas com dados isolados quando houver ambiente autenticado de teste disponível; não apresentar testes simulados como comprovação desse fluxo.

## Parte técnica
- Reutilizar e completar as operações Supabase existentes; usar migrações para alterações no banco, transações, bloqueio de linha, controle de versão e idempotência.
- Conferir todas as chamadas relacionadas antes de restringir escritas diretas, evitando quebrar consumidores existentes.
- Revisar RLS, grants e execução de funções; novas estruturas terão privilégios explícitos.
- Remover da página a coordenação de gravações independentes de consumo e estoque.

## Limites e segurança
- Não publicar automaticamente nem alterar agenda, pagamentos ou horários de clientes.
- Não baixar estoque nem modificar registros reais apenas para testar.
- Não inventar quantidades ou datas de registros antigos; casos ambíguos ficam separados para conferência.
- A validação autenticada exige ambiente isolado autorizado; não solicitar senhas na conversa.