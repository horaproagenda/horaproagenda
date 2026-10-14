# Separar atendimentos avulsos dos pacotes

## Objetivo
Corrigir banco, servidor e telas para que a compra de um pacote crie uma sequência própria, sem transformar atendimentos avulsos anteriores em etapas. O servidor será a autoridade do vínculo.

## O que foi conferido
- O vínculo atual usa `appointments.package_appointment_id` e `package_appointments.package_id/appointment_id`; não é necessário criar uma estrutura paralela com os nomes ilustrativos do arquivo.
- As funções atuais `autoheal_package_schedule`, `heal_client_package_appointments` e `find_package_session_for_appointment` procuram vínculos por cliente, nome/anotações ou serviço. Essas heurísticas permitem associação indevida; a origem exata do caso ainda será conferida no histórico.
- Ana Flávia Faria Oliveira tem o pacote **Corpo inteiro**, criado em **27/08/2026**, com uma avaliação de **19/08/2026 às 18h, no horário de São Paulo**, vinculada como sessão 1. A data do atendimento antecede o cadastro do pacote, mas o agendamento foi registrado posteriormente; data de criação não basta para decidir a origem.
- Existe um recebimento pago de **R$ 3.800 em 26/09/2026**, vinculado à venda e a essa avaliação. A correção deve preservar esse recebimento e sua forma de pagamento, sem convertê-lo em pagamento avulso ou duplicá-lo.

## Alterações
### 1. Vínculo explícito como regra oficial
- Remover associação automática por nome, cliente, serviço, valor, data ou posição no histórico, inclusive nos processos de reparo e sincronização.
- Identificar de forma persistida a origem avulsa ou de pacote, com vínculos consistentes nas duas direções. Nomes e anotações serão apenas informação visual.
- Compra/criação de pacote gera nova instância e etapas próprias. Agendamentos novos recebem os identificadores exatos da etapa; etapas sem data permanecem disponíveis, sem inventar horários.
- Impedir que um atendimento avulso existente seja convertido em etapa pelos caminhos de criação, edição, reparo ou chamadas diretas. Reagendamento de uma etapa legítima continua permitido dentro do mesmo pacote.
- Corrigir automaticamente apenas vínculos cuja origem explícita possa ser demonstrada; casos antigos ambíguos ficam para conferência, sem classificação por suposição.

### 2. Corrigir o caso de Ana Flávia
- Conferir histórico, modelo contratado, etapas e origem do pagamento antes de executar a correção específica.
- Desvincular a avaliação avulsa de 19/08 do pacote, sem apagar o atendimento ou alterar data, horário, serviço, situação ou valor individual.
- Renumerar somente as etapas pertencentes ao pacote e ajustar seus contadores, mantendo as datas e horários atuais. Não mudar a quantidade contratada nem acrescentar sessões por dedução.
- Preservar o recebimento de R$ 3.800 como pagamento da venda/pacote. Ajustar apenas referências que ficarem incorretas com a separação, com histórico de antes/depois, sem mudar valor, data ou forma de pagamento.
- Garantir que a sincronização não volte a anexar o avulso após fechar a tela, entrar novamente ou executar verificações automáticas.

### 3. Telas alinhadas ao servidor
- Agenda, histórico, etapas e ação de cobrança usarão somente o vínculo oficial, sem busca de “pacote provável”.
- Avulso aparece sem número de etapa; sequência do pacote começa em 1 entre seus próprios atendimentos.
- Atualizar os dados após confirmação do servidor e por sincronização, preservando campos em caso de erro e mostrando avisos claros.

## Parte técnica
- Auditar todos os consumidores das funções de vínculo e os gatilhos de criação, cancelamento, reconstrução, pagamento e numeração antes de restringir caminhos antigos.
- Reutilizar as tabelas existentes, acrescentando somente os campos de origem/proveniência necessários; não manter dois contadores ou dois vínculos independentes como fontes concorrentes.
- Operações transacionais, bloqueio de concorrência, repetição segura e validação de conta, cliente, etapa, profissional e permissões no servidor; revisar RLS, grants e execução de funções.
- Não aceitar marcador enviado pela tela como prova de autorização. Correção histórica será operação controlada e auditada, não conversão genérica disponível ao usuário.
- Registrar a regra permanente e atualizar testes e documentação de proteção.

## Validação
- Avulso anterior + compra de pacote: o avulso permanece independente e não consome etapa.
- Dois pacotes com mesmo nome/serviço: nunca misturar etapas.
- Reparo automático, reabertura e atualização do histórico não recriam vínculo indevido.
- Tentativa direta de anexar avulso é recusada; repetição e concorrência não duplicam etapas.
- Numeração, total contratado, horários manuais e reagendamento legítimo permanecem coerentes.
- Antes/depois de Ana Flávia: mesma avaliação, mesmos horários e mesmo recebimento de R$ 3.800, uma única vez; somente vínculo e sequência corrigidos.
- Testes de regressão e conferência das respostas oficiais; fluxo completo autenticado exige ambiente isolado autorizado. Não apresentar testes simulados ou sem login como validação completa.

## Limites
Sem publicação automática, exclusão de atendimentos, novas cobranças, envio de mensagens ou alterações em registros reais apenas para teste. Não modificar horários corretos de Lívia Santana Duque nem o componente compartilhado de tabelas. Outros clientes só terão correção histórica quando houver evidência suficiente; prevenção vale para todo o sistema.