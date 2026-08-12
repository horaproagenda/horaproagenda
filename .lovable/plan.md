# Corrigir o fluxo de troca de senha (código por e-mail + nova senha)

## O que foi verificado agora

- O código enviado para `tulioviniciuss@yahoo.com.br` **foi validado com sucesso** (registro marcado como usado às 18:50:34 de 12/08). Ou seja, o problema não é mais a validação do código.
- A conta existe no serviço de autenticação, com e-mail confirmado e sem bloqueio.
- A mensagem da tela ("Erro ao atualizar senha") vem de um único ponto do servidor: a etapa final que grava a nova senha. Hoje esse ponto **descarta o motivo real** e devolve sempre o mesmo texto genérico, e a função não gerou logs recuperáveis — por isso a causa exata ainda não está confirmada.
- Há uma inconsistência clara de regras: a tela e o servidor aceitam senha de **6 caracteres**, mas a política de senha do serviço de autenticação é mais exigente (mínimo maior e/ou bloqueio de senhas vazadas). Nesse caso a senha é recusada e o usuário só vê "Erro ao atualizar senha", sem saber o que corrigir.

## Correções previstas

1. **Mostrar o motivo real (primeiro passo, também é o diagnóstico)**
   - A etapa final passa a devolver o motivo classificado da recusa: senha curta, senha comum/vazada, senha igual à anterior, e-mail sem cadastro, limite de tentativas, falha temporária.
   - Registrar log estruturado de cada etapa (código conferido, usuário localizado, resultado da gravação) para que qualquer nova falha seja identificável imediatamente.

2. **Alinhar as regras de senha em um único lugar**
   - Usar a mesma validação já existente no app (mínimo 8 caracteres, letras + números, sem espaços) na tela de redefinição e no servidor, para que a senha nunca chegue ao serviço de autenticação fora da política.
   - Validar antes do envio, com aviso claro embaixo do campo, em vez de erro após o clique.

3. **Não perder o código já confirmado**
   - Hoje, se a gravação da senha falha, o código já foi marcado como usado e o usuário fica travado.
   - Passa a existir um "passe de redefinição" curto: ao confirmar o código, o usuário pode tentar salvar a nova senha várias vezes dentro da janela válida, sem precisar pedir novo código. Só é encerrado quando a senha é efetivamente trocada (ou quando a janela expira).
   - Contagem regressiva real da validade na tela, e botão de "solicitar novo código" habilitado assim que a janela expira.

4. **Confirmar o fim do fluxo**
   - Após sucesso, a tela volta ao login com o e-mail já preenchido e mensagem explícita de que a senha foi alterada.
   - Se a conta não existir, mensagem orientando o cadastro (em vez de erro genérico).

5. **Ferramentas para não voltar a acontecer**
   - Testes automatizados cobrindo: senha curta, senha repetida, código expirado, código já usado dentro da janela, e-mail inexistente e caminho de sucesso.
   - Teste de ponta a ponta no navegador percorrendo pedir código → validar → trocar senha → entrar com a nova senha, para confirmar em execução (não apenas no código).

## Detalhes técnicos

- `supabase/functions/reset-password/index.ts`: classificar e propagar o erro do `updateUserById` (weak_password, same_password, over_request_rate_limit, user_not_found), aplicar a política de senha compartilhada, e só apagar/consumir o registro de verificação após sucesso.
- `supabase/functions/verify-code/index.ts`: manter a marcação de uso, mas permitir reuso dentro da janela de redefinição (o `reset-password` já aceita códigos usados nos últimos 15 min — a mudança é não apagar os registros em caminhos de falha).
- `src/pages/Auth.tsx`: usar `validateNewPassword`/`explainAuthError` de `src/lib/passwordChange.ts` (extraindo a parte reutilizável para um helper compartilhado) em vez das regras próprias de 6 caracteres; exibir mensagem específica retornada pelo servidor.
- Novo helper de mensagens de redefinição + testes em `src/lib/__tests__/`.
- Sem migração de banco necessária.
