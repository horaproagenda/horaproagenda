# Corrigir as checagens automáticas do GitHub Actions

## Situação encontrada
- **Lint:** 1255 erros, acima do limite registrado de 1191. Os 64 erros novos vêm de alterações recentes.
- **Limite de assentos:** a verificação chama `get_seat_usage_report`, mas essa função não existe no banco. Por isso a verificação é pulada.
- **Testes de ponta a ponta:** há 8 arquivos na pasta e2e e uma imagem de referência da agenda. Esses testes precisam ser executados para identificar quais deixaram de bater com as telas atuais.

## Alterações
1. **Lint**
   - Identificar os arquivos que geraram os 64 erros novos e corrigir apenas esses erros: variáveis sem uso, tipos `any` novos, regras de hooks e importações.
   - Não fazer nenhuma mudança de comportamento. O limite de erros só pode diminuir.
2. **Limite de assentos**
   - Criar a função `get_seat_usage_report()` no banco. Ela devolve, para cada conta que o usuário pode ver, o número de usuários em uso e o limite contratado.
   - A regra de contagem será a mesma usada hoje em `get_seat_usage`.
   - A função só terá permissão de execução para usuários autenticados. Um administrador verá apenas a própria conta, e o super administrador verá todas.
   - Atualizar o teste para falhar quando a função não existir, em vez de pular a verificação.
   - Se o teste encontrar contas reais acima do limite, não vou alterar nenhum dado. Vou apenas informar quais contas estão nessa situação.
3. **Testes de ponta a ponta e imagens de referência**
   - Executar o Playwright em um ambiente local e corrigir os seletores e textos que mudaram: botões removidos, novos botões de documento, etapas de kit e intervalos removidos.
   - Gerar a imagem da agenda novamente apenas se a diferença vier de uma mudança de layout intencional.

## Validação
- Lint dentro do limite, verificação de tipos, testes unitários, Playwright e compilação.
- O teste de integridade não poderá rodar aqui, porque precisa das credenciais protegidas do GitHub. A confirmação final dele ficará para a próxima execução no GitHub Actions.

## Detalhes técnicos
- A migração terá uma função `SECURITY DEFINER` com `search_path` fixo e `REVOKE` para `PUBLIC` e `anon`.
- Antes de tocar nos testes, cada um vai receber uma nota em `docs/protected-behaviors.md`, quando houver um comportamento protegido envolvido.
