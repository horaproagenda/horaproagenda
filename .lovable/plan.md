# Revisão dos avisos de segurança restantes

A proteção contra senhas vazadas fica desligada, como você decidiu. Ela será registrada como decisão sua e não vai mais aparecer como pendência.

## O que foi encontrado (296 avisos)

1. **Funções que funcionam sem login (8):** links públicos de documento, confirmação de agendamento por link, link de cadastro do cliente e registro de eventos de documento. Os clientes usam essas funções sem conta, então elas precisam continuar abertas. Cada uma será revisada para confirmar que só aceita um código de link válido e que devolve apenas os dados daquele link. A função de registro de eventos (`log_document_event`) será limitada para que não aceite gravações arbitrárias.
2. **Funções com permissões elevadas usadas por quem está logado (164):** vou separar em três grupos:
   - usadas pelo app (agenda, caixa, pacotes, fichas): continuam como estão, porque cada uma já confere permissão e conta;
   - auxiliares internas (verificação de papel, cálculos, rotinas automáticas): o acesso direto de usuários será retirado, mas elas continuam funcionando dentro do sistema;
   - rotinas de fundo chamadas só pelo servidor (lembretes, cobrança, integridade): o acesso de usuários será retirado.
3. **Tabelas visíveis na listagem automática de dados (119):** a visibilidade sozinha não expõe dados, porque cada linha já é protegida por regras de acesso. Tabelas internas que o app não lê diretamente (cache de preços, verificações de troca de contato, registros técnicos) deixarão de ser visíveis. Uma tabela/visão aberta sem login vai ser fechada, a não ser que seja um dado realmente público.
4. **Tabelas protegidas sem regra (2):** cache de preços e verificações de troca de contato. Elas já ficam totalmente bloqueadas para usuários e são acessadas só pelo servidor. Será registrado que isso é intencional.
5. **Extensão de rede no espaço público (1):** é instalada pela plataforma e não pode ser movida com segurança. Será registrado que isso é aceito.

## Segurança da mudança
- Antes de retirar qualquer acesso, busco cada função no código do app e nas funções do servidor. Nada que o app usa é retirado.
- Nenhum dado de cliente é alterado.
- O teste novo falha se alguma função interna voltar a ficar acessível ou se alguma função usada pelo app perder o acesso.
- Rodo os testes, a verificação de tipos e o linter do banco. No fim, envio a contagem final e a lista do que ficou aberto de propósito.

## Detalhes técnicos
- Migração com `REVOKE EXECUTE ... FROM authenticated, anon, public` para funções que não aparecem em `supabase.rpc(...)` em `src/` nem `supabase/functions/`. As funções usadas dentro de RLS continuam funcionando, porque o dono executa as definidoras.
- Atenção: funções usadas em políticas RLS e chamadas como invoker precisam de EXECUTE para `authenticated`. Por isso, `has_role` e os auxiliares de RLS continuam acessíveis.
- `REVOKE SELECT FROM anon` no objeto marcado pelo lint 0026. Também vale para `authenticated` nas tabelas internas sem uso no app.
- Avisos que restarem e forem intencionais vão ser marcados como ignorados com justificativa.
