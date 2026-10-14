# Backend como fonte oficial de todo o Hora Pro

## Objetivo
Revisar e corrigir **backend, banco e frontend de todo o aplicativo**, garantindo que as regras, permissões, cálculos definitivos e gravações sejam decididos no servidor. As telas apresentam os dados oficiais e solicitam operações; não mantêm uma verdade paralela.

## Base confirmada e limites do diagnóstico
- O código já utiliza operações de servidor em parte dos fluxos, como registros de uso de produtos e envio validado de documentos.
- Também existem gravações diretas e sequências coordenadas pelo frontend em módulos de vendas, financeiro, agendamentos e configurações. Cada caminho será confrontado com as funções e gatilhos efetivamente instalados antes de ser alterado.
- O aplicativo possui sincronização em tempo real e verificações automáticas de integridade. A revisão deve aproveitar o que funciona, não substituir tudo indiscriminadamente.
- Políticas, permissões, automações e inconsistências atuais do banco ainda precisam de auditoria nesta revisão; não serão consideradas defeituosas apenas pela leitura do código.

## Execução por etapas

### 1. Auditar todos os caminhos e definir a autoridade por domínio
- Mapear criação, edição, exclusão, mudança de status, importação, links públicos, integrações e tarefas automáticas.
- Cobrir clientes, profissionais, usuários, serviços, pacotes, agenda, salas/equipamentos, produtos, vendas, financeiro, caixa, comissões, documentos, fichas, lembretes, WhatsApp, notificações, configurações e assinaturas.
- Para cada operação, conferir código, estrutura e dados relevantes do banco, regras de acesso, funções e gatilhos existentes.
- Registrar a fonte oficial de cada informação e identificar escritas paralelas, possíveis duplicidades e cálculos divergentes, com evidências.

### 2. Consolidar as operações críticas no servidor
Prioridade: **vendas/pagamentos/caixa → agenda/pacotes → produtos → documentos/fichas → demais cadastros, configurações e integrações**.
- Reutilizar e corrigir operações existentes antes de criar outras.
- Fazer alterações relacionadas no banco em uma transação: ou todas são gravadas, ou nenhuma.
- Proteger contra repetição de cliques, tentativas após falhas de rede e eventos repetidos de integrações.
- Validar concorrência para impedir que uma edição antiga sobrescreva alterações recentes.
- Derivar usuário, clínica e permissões da sessão no servidor. Validar valores, vínculos, datas e transições de status sem depender das telas.
- Manter estoque, saldo de pacotes, recebimentos e comissões rastreáveis, sem dupla baixa ou pagamento fictício.
- Integrações externas usam operações idempotentes, registro de processamento e recuperação segura; uma transação do banco não torna uma chamada externa atômica.

### 3. Fechar caminhos que contornam as regras
- Conferir RLS, grants, funções com privilégios elevados e acesso a arquivos.
- Restringir gravação direta de campos derivados e registros de ciclo de vida quando ela permitir contornar uma operação oficial.
- Preservar CRUD direto somente quando o banco já impuser integralmente as regras necessárias.
- Manter separação entre clínicas, dados privados e dados compartilhados; proteger links públicos com escopo e validação próprios.
- Auditar alterações relevantes e tentativas de operações não autorizadas sem registrar segredos.

### 4. Alinhar todas as telas à resposta oficial
- Substituir sequências de gravação e decisões definitivas locais pelas operações validadas no servidor.
- Manter validações de formulário para conforto do usuário, com equivalente obrigatório no servidor.
- Mostrar sucesso somente após confirmação; reler os dados persistidos e atualizar os módulos dependentes.
- Apresentar conflitos e falhas em linguagem clara, preservando os dados digitados.
- Conferir sincronização após gravação, reconexão, mudança de usuário e eventos em outro dispositivo.
- Cache e PWA não podem confirmar pagamentos, reservas ou baixas ainda não aceitos pelo servidor; ações pendentes devem ficar claramente diferenciadas.
- Relatórios e PDFs usam as fontes oficiais e versões corretas, sem reconstruir estados financeiros ou clínicos a partir de cópias divergentes.

### 5. Dados antigos e automações
- Diagnosticar divergências antes de corrigir; reconciliar apenas vínculos e valores comprovados, com auditoria.
- Não inventar quantidade, forma de pagamento, data de uso ou término. Registros ambíguos ficam identificados para decisão do responsável.
- Levar verificações de integridade que alteram dados para execução controlada no backend, sem depender de uma tela aberta.
- Evitar que tarefas automáticas contradigam escolhas manuais ou restaurem dados antigos.

## Proteções obrigatórias
- Preservar datas e horários escolhidos manualmente, inclusive os horários corretos de Lívia Santana Duque; não reagendar clientes durante esta revisão.
- Produtos continuam usando somente datas e duração em dias inclusivos; correções de ciclos concluídos exigem motivo e histórico.
- Preservar recebimentos existentes, obrigatoriedade da forma de pagamento, parcelas de boleto vinculadas a Boleto e documentos com versão congelada.
- Fichas finalizadas permanecem imutáveis, com retificação vinculada.
- Não alterar o componente compartilhado `src/components/ui/table.tsx` nem redesenhar telas sem necessidade para a correção.
- Não publicar automaticamente e não baixar estoque, cobrar, enviar mensagens ou alterar registros reais apenas para teste.

## Validação e critérios de conclusão
- Testes por operação para permissões, isolamento, valores concretos, rollback, repetição e edições concorrentes.
- Testar as regras também chamando o servidor diretamente, sem depender dos bloqueios visuais.
- Validar cada fluxo central pelas telas autenticadas com dados de teste isolados, relendo o resultado no banco e nas telas relacionadas.
- Conferir funcionamento em computador e celular, perda de conexão e reconexão.
- Executar testes de regressão pertinentes; acompanhar as verificações automáticas de compilação e revisar diagnósticos do banco.
- Acesso autenticado de teste ao Supabase externo deve estar disponível para concluir a validação ponta a ponta; sem ele, declarar explicitamente os fluxos não verificados.
- Cada etapa terá evidências, testes e pendências próprias. A revisão só será considerada integralmente concluída quando todas as operações mapeadas tiverem sido verificadas, não apenas quando as telas compilarem.

## Detalhes técnicos
- Manter React/Vite no frontend e o Supabase conectado como backend; não adicionar um servidor persistente ao projeto.
- Usar RPCs PostgreSQL para transações locais e Edge Functions para integrações e processamento que precisem delas.
- Fazer mudanças de banco por migrações versionadas, com grants explícitos, RLS e estratégia de reversão; conferir o estado instalado após cada etapa.
- Registrar a autoridade por domínio em `AGENTS.md`, atualizar o roteiro de execução e os comportamentos protegidos durante a implementação.
- Não exige reescrever o aplicativo inteiro: corrigir os caminhos comprovadamente divergentes e preservar os já protegidos.