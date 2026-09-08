# Corrigir permissões e isolamento por profissional

## Resultado esperado

- Um profissional com **Possui seu próprio financeiro** acessa e administra somente seus lançamentos, categorias, formas de pagamento, bancos, boletos, bandeiras e taxas.
- Esses registros permanecem invisíveis para administrador, recepção e outros profissionais quando o compartilhamento estiver desligado.
- **Abrir e fechar caixa** passa a significar exclusivamente operar o caixa da clínica; não cria nem seleciona um caixa pessoal.
- Todo profissional pode criar e administrar os próprios produtos, lembretes e documentos privados.
- A permissão **Acessar documentos da clínica** é adicional: permite ver e usar modelos da clínica sem retirar o direito de criar documentos próprios.

## Alterações

### 1. Unificar os botões de permissão
- Separar claramente **Possui seu próprio financeiro** de **Abrir e fechar caixa da clínica**.
- Remover dependências e exclusões indevidas entre permissões de produtos e documentos.
- Sincronizar a configuração do profissional com as permissões detalhadas usadas pelo menu, pelas páginas e pelo banco.
- Invalidar as permissões em tempo real após salvar, para ligar/desligar produzir efeito sem novo login.

### 2. Isolar o financeiro próprio no banco
- Aplicar propriedade pelo usuário autenticado e isolamento em categorias, lançamentos, formas de pagamento, bancos, boletos, bandeiras e taxas.
- Permitir ao dono criar, visualizar, editar, dar baixa e apagar somente os próprios registros.
- Permitir compartilhamento com administrador/recepção apenas quando a opção correspondente estiver ativa.
- Impedir que registros pessoais entrem em agenda, caixa, extrato, painel, relatório ou notificações de terceiros.
- Manter registros financeiros da clínica e operações originadas pela clínica separados dos registros pessoais.

### 3. Corrigir o caixa da clínica
- Fazer **Abrir e fechar caixa da clínica** selecionar sempre o caixa sem profissional proprietário.
- Autorizar recepcionista ou profissional somente quando essa opção estiver ativa.
- Bloquear abertura/fechamento assim que a opção for desligada, sem conceder acesso ao restante do financeiro da clínica.

### 4. Corrigir produtos pessoais
- Permitir que qualquer profissional autenticado crie produtos próprios, independentemente de acesso aos produtos da clínica.
- Forçar esses produtos como privados e atribuir o dono no banco.
- Permitir editar, excluir, comprar e vincular apenas os próprios produtos a seus serviços/pacotes; impedir exposição para outros usuários.

### 5. Corrigir lembretes pessoais
- Restringir leitura, edição, conclusão, exclusão e notificações ao criador do lembrete.
- Remover a exceção que atualmente permite administrador e recepção verem lembretes pessoais.

### 6. Corrigir documentos
- Permitir que qualquer profissional crie, edite, duplique e apague os próprios modelos/documentos privados.
- Fazer **Acessar documentos da clínica** mostrar modelos gerais da clínica sem misturá-los com documentos privados de terceiros.
- Manter as permissões “criar próprios” e “ver documentos da clínica” independentes.

## Detalhes técnicos

- Alterar as políticas de segurança e funções auxiliares por migração versionada, preservando isolamento por conta e auditoria.
- Derivar dono, profissional e clínica exclusivamente da sessão autenticada; não confiar em identificadores enviados pela tela.
- Ajustar os filtros e controles das páginas para refletirem exatamente as regras do banco.
- Manter compatibilidade com permissões já salvas, convertendo o significado antigo de caixa próprio para financeiro próprio quando aplicável.

## Testes e validação

- Adicionar regressões para cada opção ligada e desligada e registrar os novos comportamentos protegidos.
- Testar dois profissionais e um administrador para confirmar isolamento e compartilhamento.
- Testar todas as ações financeiras citadas: criar, editar, dar baixa e apagar.
- Testar abertura/fechamento do caixa da clínica por usuário autorizado e bloqueio após desligar.
- Testar criação privada de produto, lembrete e documento; testar leitura autorizada de documento geral da clínica.
- Executar testes do banco, testes da aplicação, verificação de tipos, compilação e fluxo autenticado no navegador quando a sessão disponível permitir.
