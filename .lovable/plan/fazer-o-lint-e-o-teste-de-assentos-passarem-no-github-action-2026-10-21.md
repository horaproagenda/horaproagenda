# Fazer o lint e o teste de assentos passarem no GitHub Actions

## O que encontrei
- **Lint:** hoje há 1195 erros, e o limite registrado é 1189. São 6 erros a mais, quase todos do tipo `any`, em arquivos de teste alterados recentemente: `tests/smoke/package-session-operation.smoke.test.ts`, `preferences`, `overlay-consumers`, `package-reschedule`, `realtime` e `src/__tests__/regression/install-and-share.test.tsx`.
- **Assentos:** a função `get_seat_usage_report` já existe no banco e quem está logado pode usá-la. A causa da falha ainda não está confirmada. Há duas possibilidades: (a) alguma conta real está acima do limite contratado, e o teste está cumprindo seu papel; ou (b) a conta de teste do GitHub não consegue ler a função ou recebe uma resposta em outro formato.

## Alterações
1. **Lint**
   - Substituir os `any` e corrigir os outros erros desses arquivos de teste por tipos corretos. Não muda nenhum comportamento.
   - Rodar `bun run lint:guard` até o resultado ficar em 1189 erros ou menos.
2. **Assentos**
   - Primeiro, confirmar a causa: calcular, com uma consulta só de leitura, quais contas estão acima do limite.
   - Se a causa for uma conta real acima do limite: **não altero dados**. Informo qual conta é, e você decide se aumenta o plano ou desativa usuários. Também ajusto a mensagem do teste para mostrar o identificador da conta.
   - Se a causa for permissão ou formato: corrijo a função ou o teste para ler o resultado corretamente.
   - Adicionar um teste local que falha se a função deixar de existir ou perder a permissão de uso.

## Validação
- `lint:guard`, verificação de tipos e testes unitários.
- O teste de fumaça só roda no GitHub, porque depende das senhas guardadas lá. Se o problema for uma conta acima do limite, ele só vai passar depois que você resolver o plano dessa conta.

## Se algo não puder ser feito aqui
Vou passar um passo a passo completo, com os comandos para abrir, editar e salvar os arquivos e os códigos exatos.
