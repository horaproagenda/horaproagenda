# Corrigir integralmente o fluxo de registros de produtos

## Objetivo
Garantir que cada quantidade colocada em uso tenha um registro completo e confiável — quantidade, grandeza, início, término, atendimentos, média e baixa no estoque — e usar esse histórico para abrir o próximo ciclo e avisar o profissional antes e depois do término.

## Diagnóstico confirmado
- Há hoje **11 ciclos ativos** no banco, porém **nenhum ciclo encerrado** foi gravado no novo histórico de uso nem nos lançamentos diários. Assim, as previsões e notificações ainda não conseguem se basear no fluxo novo.
- Início, término, histórico, lançamentos diários e estoque são salvos por chamadas separadas. Uma falha intermediária pode deixar datas ou saldo divergentes.
- O formulário aceita quantidade vazia e usa principalmente a unidade geral do produto; ele não fixa de forma confiável a grandeza definida no vínculo com serviço/pacote.
- O aviso preditivo ainda lê registros antigos de consumo por atendimento e atualiza por intervalo de até cinco minutos, em vez de usar imediatamente os ciclos encerrados e o consumo diário novo.
- Ao encerrar, já existe uma pergunta para iniciar outro ciclo, mas o segundo formulário não reaproveita claramente a última quantidade/grandeza e não obriga o novo registro completo.

## Implementação

### 1. Registro único e seguro do ciclo
- Criar operações transacionais no banco para **iniciar** e **encerrar** um ciclo, evitando gravações parciais.
- No início, exigir produto, quantidade positiva, grandeza válida e data; impedir quantidade acima do estoque disponível e impedir dois ciclos ativos para o mesmo produto.
- No término, exigir data igual ou posterior ao início e gravar de uma só vez:
  - data inicial e final;
  - quantidade e grandeza usadas;
  - atendimentos concluídos no período;
  - média por atendimento e duração;
  - histórico do ciclo;
  - lançamentos diários;
  - baixa exata e única no estoque.
- Tornar o encerramento idempotente para que clique repetido, falha de rede ou nova tentativa não desconte nem registre duas vezes.
- Manter `products` e a compra/ciclo ativo sincronizados sem permitir que automações antigas restaurem datas anteriores.

### 2. Grandeza correta e permanente
- Determinar a grandeza do ciclo pelos vínculos ativos do produto com serviços e pacotes.
- Se todos os vínculos forem da mesma família, manter a grandeza escolhida no vínculo (litro, mililitro, quilo, grama, miligrama ou unidade) no formulário seguinte e no histórico.
- Converter somente dentro da mesma família (por exemplo, litro ↔ mililitro); bloquear combinações incompatíveis com mensagem clara.
- Quando houver vínculos com grandezas diferentes, mas compatíveis, apresentar uma única grandeza oficial do ciclo sem alterar silenciosamente o valor informado.
- Para produto ainda sem vínculo, usar a grandeza cadastrada no próprio produto.

### 3. Formulário de novo registro após o término
- Após salvar o término, sempre abrir a pergunta para iniciar uma nova quantidade, inclusive quando o saldo chegou a zero.
- Oferecer:
  - **Iniciar nova quantidade**: abre formulário com a grandeza preservada, última quantidade como sugestão editável e data de início preenchida com hoje;
  - **Atualizar estoque e iniciar**: quando não houver saldo suficiente, permite registrar primeiro a reposição/ajuste e depois iniciar o ciclo;
  - **Agora não**: mantém o produto sem ciclo ativo.
- Exibir quantidade disponível, quantidade sugerida e grandeza de modo inequívoco; não iniciar automaticamente sem confirmação.
- Bloquear botões durante a gravação e manter o formulário aberto com os dados digitados se ocorrer erro.

### 4. Datas e histórico visíveis
- Corrigir os campos de data para salvar tanto por seleção quanto por digitação completa, sem depender de uma sequência frágil de perda de foco.
- Mostrar no produto o ciclo ativo e a lista de ciclos encerrados, cada um com quantidade/grandeza, início, término, duração, atendimentos, média e saldo após a baixa.
- Fazer os cartões Hoje, Semana, Mês, Semestre e Ano lerem os lançamentos do ciclo sem duplicar registros antigos de consumo.
- Atualizar produtos, compras, histórico, consumo e alertas em tempo real após qualquer alteração.

### 5. Notificações baseadas nos registros
- Calcular a previsão usando ciclos encerrados válidos e o ritmo do ciclo ativo: duração histórica, média por atendimento e atendimentos realizados desde o início.
- Avisar o profissional responsável quando a quantidade em uso estiver próxima do fim, indicando discretamente produto, quantidade/grandeza estimada, data e horário.
- Quando o ciclo terminar ou o saldo ficar insuficiente, emitir alerta para **atualizar o estoque ou iniciar uma nova quantidade**.
- Manter o isolamento já exigido: produto privado notifica somente seu criador; produto da clínica notifica apenas profissionais autorizados a acessá-lo.
- Invalidar as notificações imediatamente por atualização em tempo real, sem aguardar cinco minutos.

### 6. Compatibilidade e correção dos registros existentes
- Preservar os 11 ciclos ativos atuais e reconciliar apenas inconsistências comprovadas entre produto e compra ativa.
- Não inventar término, média ou consumo para ciclos sem data final.
- Disponibilizar reconciliação segura para ciclos encerrados que tenham datas/quantidade válidas, mas estejam sem histórico, sem duplicar baixas já realizadas.

## Testes obrigatórios
- Início e término persistem após fechar/reabrir a tela e após atualização em tempo real.
- Grandeza permanece igual à vinculada em ciclos consecutivos: litro, mililitro, quilo, grama, miligrama e unidade.
- Estoque 600, ciclo 100: encerramento deixa 500; repetição continua em 500.
- Ciclo de 100 com 40 atendimentos: média 2,5; cancelados, faltas e remarcados não contam.
- Data final anterior à inicial é bloqueada; digitação de data em notebook e seleção no celular funcionam.
- Encerramento abre o novo formulário com mesma grandeza e quantidade anterior editável.
- Saldo insuficiente oferece atualização do estoque sem criar ciclo inválido.
- Alertas de “acabando” e “acabou/atualize o estoque” chegam somente ao profissional autorizado e somem após reposição/novo ciclo.
- Cartões por período e histórico atualizam sem recarregar e sem contagem dupla.
- Executar testes de regressão do fluxo, suíte completa de produtos, verificação de tipos, build e `test:prepublish`; validar visualmente em desktop e celular.
