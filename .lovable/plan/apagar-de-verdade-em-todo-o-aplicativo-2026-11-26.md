# Apagar de verdade em todo o aplicativo

## O que encontrei
Revisei cerca de 45 botões de apagar. A maioria já apaga de verdade. Os problemas estão em quatro grupos:

1. **Arquivos que ficam guardados:** ao apagar um documento do cliente, ou um cliente inteiro, os arquivos (PDFs e fotos) continuam no armazenamento. Some só a ficha que aponta para eles, e esse espaço fica ocupado para sempre. O mesmo acontece ao excluir a conta ou um usuário, e com imagens tiradas de um modelo de documento.
2. **Apagar pela metade ou "sucesso" falso:**
   - **Caixa atual:** a exclusão ignora erros e pode mostrar "excluído" sem ter excluído.
   - **Pacotes da agenda, serviços com produtos e "apagar todos os boletos":** apagam em etapas soltas. Se uma etapa falhar, sobram lançamentos órfãos.
   - **Limpeza em massa (Configurações):** apaga tabela por tabela e, se algo falha no meio, a tela não atualiza.
3. **Itens que só são "cancelados":**
   - **Consumo manual de produto:** fica marcado como cancelado.
   - **Etapas de kit confirmadas ou pagas:** viram "cancelado" em vez de sumir.
4. **Telas que não atualizam:** depois de apagar um produto, um cliente ou uma venda, algumas listas continuam mostrando o item até recarregar a página. Também há dois atalhos que apagam atendimentos sem a regra completa: a lixeira no cartão da agenda e a tela de serviço. Eles podem deixar lançamentos financeiros soltos.

## O que vai mudar
- **Tudo é excluído de vez,** inclusive o histórico de quem apagou e quando, como você escolheu.
- **Arquivos junto:** ao apagar documento, foto, cliente, conta ou usuário, os arquivos também saem do armazenamento.
- **Tudo ou nada:** cada exclusão passa a acontecer de uma vez no banco. Ou apaga tudo o que está ligado, ou não apaga nada e mostra o motivo.
- **Sem "cancelado" guardado:**
  - **Consumo manual:** apagar remove o registro e devolve o estoque.
  - **Etapas de kit:** apagar remove as etapas. As já concluídas continuam protegidas, porque contam como atendimento feito. Para elas existe a exclusão completa do cliente ou do pacote.
- **Listas atualizam na hora** em todos os aparelhos, depois de qualquer exclusão.
- **Limpeza automática:** uma vez por dia (1 execução diária), o app remove arquivos sem dono que já estejam sobrando no armazenamento.

## O que continua bloqueado de propósito
- Excluir "só o cadastro" de um cliente com atendimentos. A opção "Excluir cliente e TODOS os registros" continua apagando tudo.
- Excluir um pacote com aplicações em aberto. É preciso concluir ou cancelar antes.
- Excluir uma compra de produto já em uso. Para isso, exclui-se o produto inteiro.

## Detalhes técnicos
- **Armazenamento:** criar a função de servidor `purge-storage` (service role), chamada pelos hooks após o RPC com a lista de caminhos retornada. Os RPCs `force_delete_client`, `delete_client_registration_only` e de documento passam a retornar `file_paths`. `delete-my-account` e `admin-delete-user` limpam os buckets do dono. A limpeza diária de órfãos roda via pg_cron, comparando `storage.objects` com as referências.
- **Auditoria:** os RPCs de exclusão removem as linhas de `audit_logs`/`audit_log`/`package_audit_logs`/`product_usage_events` do registro apagado, e o trigger de auditoria é suprimido nessas operações, via um flag de sessão `app.hard_purge`.
- **Novos RPCs atômicos:**
  - `delete_cash_register_atomic`
  - `delete_all_boletos_atomic`
  - `delete_service_atomic`
  - `bulk_delete_account_data`
  - `delete_client_document` (retorna o caminho do arquivo)
  - Alterar `cancel_manual_product_consumption` para DELETE com estorno.
  - Alterar `delete_kit_appointments`: hard delete de confirmadas/pagas, revertendo o pagamento pelo caminho de `reverse-payment`.
- **Front:**
  - `AppointmentCard` e `ServiceDetailDialog` passam a usar `delete_appointment_cascade`.
  - `deletePackageAppointments` passa para um RPC único.
  - Corrigir as chaves de invalidação em `useProducts` (`product_purchases`, `product_usage_records`, `service_products`), `useClients` (todas as caches purgadas) e `useSingleSales.deleteSale`.
  - `ClientPhotosTab` e `ClientHeader` passam a checar o erro do storage.
- **Testes de regressão:** consumo manual removido devolve o estoque; o caixa com erro não mostra sucesso; o documento apagado envia o caminho para remoção; e as chaves de cache estão corretas.
- **Observação:** o banco estava fora do ar há pouco. As mudanças no banco só podem ser aplicadas quando ele responder.
