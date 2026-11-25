# App não abre: servidor de dados fora do ar

## O que confirmei agora
- O app em si carrega: a tela de entrada aparece normalmente e sem erros.
- O servidor de dados do app (Supabase) não está respondendo: tanto o login quanto as buscas de dados ficam 20 segundos sem resposta. Mais cedo hoje ele também já tinha aparecido como indisponível.
- Por isso, quem já está logado fica com a tela vazia esperando dados que não chegam. A causa não é a atualização de velocidade do app.

## O que você precisa fazer (só você tem acesso)
1. Entrar no painel do Supabase do projeto e ver se ele aparece como pausado, reiniciando ou sem recursos (limite do plano atingido).
2. Se estiver pausado ou travado, usar "Restore" ou "Restart project" em Settings → General.
3. Em Reports/Usage, conferir se o limite de uso do banco ou de conexões foi atingido; se foi, pode ser preciso subir o plano.

## O que vou fazer no app
1. Quando o servidor não responder, mostrar um aviso claro ("Servidor temporariamente indisponível, tentando novamente…") em vez de tela vazia, com botão para tentar de novo.
2. Abrir com as informações já guardadas no aparelho, mesmo sem resposta do servidor, para a tela não ficar zerada.
3. Pausar as verificações automáticas em segundo plano enquanto o servidor estiver fora, para não sobrecarregá-lo quando ele voltar.
4. Quando o servidor voltar, confirmar com você que o app abre normalmente.

## Detalhes técnicos
- Timeout na inicialização da sessão (`getSession`) com fallback para a sessão em cache e banner de indisponibilidade.
- Backoff no auto-heal/health-check (hoje reexecuta a cada ~15 s com timeout).
