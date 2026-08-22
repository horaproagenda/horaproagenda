# Auditoria funcional — 2026-08-22

Escopo: botões, formulários, fluxos, backend, permissões e estados de tela.
Método: suíte automatizada (502 testes + smoke de RLS), varredura estática de
todos os `*.tsx`/`*.ts` de `src/`, navegação real com Playwright (desktop 1280px
e mobile 390px) e linter do banco.

## O que foi verificado

| Frente | Como | Resultado |
| --- | --- | --- |
| Rotas públicas (`/`, `/auth`, `/contato`, `/termos-de-servico`, `/politica-de-privacidade`, 404) | Playwright, 1280px e 390px | 12 checagens: 0 erro de console, 0 requisição 4xx/5xx, 0 rolagem horizontal, 1 `H1` por página |
| Botões de ação assíncrona | varredura de todos os `<Button>` com `type="submit"` ou handler de gravação | 12 sem guarda encontrados; 6 corrigidos, 6 classificados como síncronos (exportação CSV/PDF, sem risco) |
| `useMutation` (105 no projeto) | varredura por `onError` e por invalidação de cache | 10 sem retorno de erro ao usuário → corrigidos; invalidação de cache OK em todas (as 11 apontadas usam `invalidateAll`) |
| Handlers vazios / botões decorativos | busca por `onClick={() => {}}`, `onClick={undefined}`, TODO/FIXME | nenhum encontrado |
| Formulários | `onSubmit` com `preventDefault`/`handleSubmit` | todos os formulários tratam o envio; nenhum recarrega a página |
| Permissões e isolamento por conta | 19 testes de regressão de permissões + 37 checagens de RLS anônimo | passando |
| Banco de dados | linter Supabase | 1 função sem `search_path` fixo corrigida por migration |

## Problemas encontrados e corrigidos

1. **Duplicação no financeiro (crítico).** "Criar Categoria", "Criar Receita/Despesa",
   "Adicionar" (contas a pagar) e "Confirmar Pagamento" não desabilitavam durante o
   salvamento. Como esses handlers criam parcelas em laço, um toque duplo (comum no
   celular) gerava categorias, parcelas e pagamentos duplicados.
   *Causa:* ausência de estado de execução no botão.
   *Correção:* novo `src/hooks/useActionGuard.ts` (trava por `ref`, imune ao atraso de
   re-render) aplicado aos quatro botões, com texto "Salvando..." / "Registrando...".
2. **Ações sem resposta (alto).** 10 mutations exibiam sucesso, mas falhavam em
   silêncio: marcar/cancelar parcela de boleto (duas telas), vincular sessão de pacote
   ao agendamento, marcar serviço como utilizado, registrar consumo de produto,
   remover registro de uso, remover da lista de espera e alterar status da lista de espera.
   *Causa:* `useMutation` sem `onError`.
   *Correção:* mensagem clara em português em cada uma (humanizada pelo wrapper global de toast).
3. **Botão "Criar Categoria" de serviços** e **"Confirmar cancelamento"** (unsubscribe)
   permitiam reenvio. Corrigidos com `isSubmitting` e trava de estado.
4. **Página 404 em inglês e fora do padrão.** "Oops! Page not found / Return to Home",
   com `<a href="/">` que recarregava o app inteiro e `console.error` poluindo o log.
   *Correção:* página em português, botões "Voltar" e "Ir para o início" via router
   (sem recarregar), alvos de 44px, `noindex` e log rebaixado para aviso.
5. **SEO das páginas públicas.** Contato, Termos e Política não tinham `H1` (começavam
   em `h3`/`h2`). Corrigido com um único `H1` por página.
6. **Banco:** `convert_product_quantity` sem `search_path` fixo. Corrigido por migration.
7. **Teste instável (suíte não confiável).** `CreateUserDialog.test.tsx` falhava de forma
   intermitente: o diálogo usa portal e o DOM não era desmontado entre os casos, então a
   busca por texto encontrava elementos duplicados. Corrigido com `cleanup()` no
   `afterEach`. Validado em execuções repetidas.

## Testes criados

`src/__tests__/regression/functional-audit-invariants.test.ts` (11 casos):
guarda de clique duplo existente e ativa nos botões do financeiro; nenhum botão de
ação sem `disabled` nos arquivos auditados; **toda** `useMutation` do projeto com
`onError` (falha se alguém adicionar uma nova sem tratamento); mensagens claras em
boletos/estoque/lista de espera; 404 em português, sem `<a href>` e com `noindex`;
um único `H1` em cada página pública.

## Testes executados

- 70 arquivos / 513 testes unitários e de integração: **todos passando**.
- 37 checagens de RLS anônimo (smoke): **todas passando**.
- Typecheck e build: **sem erros**.
- Navegador: 6 rotas públicas × 2 viewports (12 checagens): **sem erro de console ou de rede**.

## Módulos afetados pelas correções

Financeiro (categorias, contas a pagar, boletos), Serviços (categorias), Produtos
e estoque (consumo e registros de uso), Clientes (pacotes e serviços do cliente),
Lista de espera, páginas públicas (404, Contato, Termos, Política), banco de dados.

## Dispositivos verificados

Desktop 1280px e mobile 390px em Chromium (motor do Chrome para Android e base das
checagens de layout do iOS). Invariantes de iPhone (`100dvh`, `--kb-inset`,
safe-areas, alvos de toque, rolagem de tabelas) cobertos por 12 testes automatizados.

## Pendências (auditoria NÃO está completa)

1. **Área autenticada não foi navegada.** O projeto usa Supabase externo
   (`external_unmanaged`), então não é possível criar sessão de teste no ambiente de
   auditoria. Dashboard, Agenda, Clientes, Atendimentos, Salas compartilhadas,
   Serviços, Pacotes, Produtos, Financeiro, Relatórios, Documentos, Profissionais,
   Unidades, Configurações e Perfil foram auditados por código e testes, **não** por
   clique real em cada botão. Para cobrir isso é necessário um usuário de teste
   dedicado nesse Supabase.
2. **Linter do banco:** 82 + 91 avisos de exposição no schema GraphQL e 168 + 175
   funções `SECURITY DEFINER` executáveis. São ajustes de superfície de API que podem
   quebrar telas em uso; devem ser tratados em uma passagem de segurança dedicada,
   tabela por tabela.
3. **Proteção contra senhas vazadas está desligada** no Supabase Auth — é um botão no
   painel do Supabase (Authentication → Policies), precisa ser ligado por você.
4. `contact_change_verifications` tem RLS sem políticas e sem permissões: **intencional**
   (só funções internas acessam os códigos de verificação). O linter aponta como INFO.

## Versão validada

2026-08-22 — 513 testes unitários + 37 smoke de RLS + build OK.
Ponto de rollback registrado em `docs/release-log.md`.
