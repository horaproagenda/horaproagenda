# Auditoria de responsividade e organização visual

## O que a auditoria encontrou

Inventário: 35 páginas/rotas, ~30 pastas de componentes, 32 arquivos com tabelas, ~40 arquivos com larguras fixas em pixels, 9 abas no perfil do cliente.

Já está bom (não mexer): `100dvh` + `--kb-inset` no `AppLayout`, safe-areas, anti-zoom iOS (fonte ≥16px), rolagem horizontal confinada em `[data-table-wrapper]`, `Table` com barra de rolagem dupla.

Problemas confirmados:

1. **Perfil do cliente (`ClientHeader`)** — nome/telefone/e-mail/"cliente desde" estão numa única linha `flex gap-4` sem `flex-wrap`; no celular o e-mail é truncado em 180px e os botões Editar/Excluir disputam espaço com o nome. Cabeçalho da página (`ClienteDetalhes`) tem "Histórico antigo" + "Atualizar" na mesma linha do título, sem wrap.
2. **Abas do perfil** — `grid-cols-7` fixo: em telas de 360px cada aba fica com ~45px e o texto colide com o ícone.
3. **Tabelas** — larguras mínimas grandes (`min-w-[980px]` em `ClientReportTab`, similares em Financeiro/Relatórios/Caixa) forçam rolagem lateral onde um cartão vertical seria melhor no celular. Não existe um padrão compartilhado para "tabela → cartões".
4. **Filtros e selects** — dezenas de `w-[130px]`…`w-[180px]` fixos em barras de filtro sem `flex-wrap`, causando overflow em <400px.
5. **Formulários e modais** — largura de diálogos e grids de campos variam por página; alguns usam 2 colunas já a partir de `sm`, apertando campos de telefone/CPF/valor.
6. **Botões** — alturas e tamanhos de texto inconsistentes entre páginas (`h-7 text-[11px]`, `h-8 text-xs`, `size="sm"` padrão) e rodapés de diálogo sem largura total no celular.

Nada disso envolve regra de negócio, banco, permissões ou cálculo — a correção fica em CSS/JSX de apresentação.

## Plano de correção

### Etapa 1 — Fundação compartilhada (maior ganho, menos risco)

- **`src/index.css`**: normalizar breakpoints e adicionar utilitários de apresentação:
  - `.field-grid` (1 coluna até `md`, 2 colunas acima) para formulários;
  - `.filter-bar` (flex-wrap + gap, filhos com `min-w-0` e largura fluida com mínimo confortável);
  - `.action-row` (botões empilhados em largura total até `sm`, em linha depois);
  - `.stack-mobile` para pares label/valor.
- **Novo `src/components/ui/responsive-table.tsx`**: componente `ResponsiveTable` que recebe as colunas já existentes e, em `pointer: coarse`/telas <768px, renderiza cada linha como cartão vertical (rótulo + valor, ações no rodapé do cartão); acima disso mantém a `Table` atual com rolagem interna. Colunas ganham marcação de prioridade (`primary`/`secondary`) para o modo cartão.
- **`src/components/shared/`**: `PageHeaderActions` para o padrão título + ações com wrap, e padronizar `CompactFilterTrigger` como gatilho único de filtros.
- **`ui/dialog.tsx` / `ui/sheet.tsx`**: garantir `w-[calc(100vw-1.5rem)]`, `max-h` com `--kb-inset` (já parcial) e rodapé com botões em largura total no celular.
- **`ui/select.tsx` / `searchable-select.tsx`**: trocar `w-[...]` fixo por `w-full min-w-0` com `sm:w-[...]` quando houver espaço.

### Etapa 2 — Perfil do cliente

- `ClientHeader`: grid de 3 áreas (avatar / identidade / ações). No celular: avatar + nome + status na primeira linha, contatos empilhados com ícone e valor selecionáveis (sem truncar telefone), ações em linha própria de largura total. E-mail com `break-all` em vez de truncamento.
- `ClienteDetalhes`: cabeçalho com wrap; `TabsList` rolável horizontalmente no celular (`overflow-x-auto`, `snap`), 7 colunas só a partir de `lg`.
- `ClientInfoTab` e demais abas: seções nomeadas (Dados pessoais, Contato, Endereço, Observações) com `.field-grid`.
- `ClientReportTab`, `ClientCreditsTab`, `ClientAppointmentsTab`, `ClientQuotesTab`: migrar para `ResponsiveTable`; filtros com `.filter-bar`.

### Etapa 3 — Páginas com tabelas

Aplicar `ResponsiveTable` + `.filter-bar` em: Clientes, Produtos, Servicos, Caixa (CashRegisterPanel, CommissionsReport, SaleForm), Financeiro (ExtratoFinanceiro, ContasAPagar, ContasAReceber, PacotesFinanceiro, FormasPagamento, RelatorioConsolidado, MeusCaixas, PrecificacaoServicos), Relatorios (ConciliacaoPagamentos, AtendimentosPorProfissional), AdminPanel, UsuariosConta, auditoria/AccessLogsTable, ProfissionalDetalhes.

### Etapa 4 — Formulários e modais

Padronizar com `.field-grid` e `.action-row`, mantendo todos os campos existentes: NewAppointmentDialog, EditRecurringAppointmentDialog, formulários de cliente/serviço/pacote/produto/fornecedor, Configuracoes, Onboarding, BulkImportDialog, documentos.

### Etapa 5 — Validação real

- Ampliar `src/__tests__/regression/mobile-invariants.test.ts` com regras contra `w-[NNNpx]` sem contraparte fluida e contra tabelas fora de `[data-table-wrapper]`.
- Script Playwright percorrendo as rotas principais em 320×568, 390×844, 768×1024, 1024×768 e 1440×900, verificando por página: `scrollWidth <= clientWidth` no `body`, nenhum retângulo de texto/botão sobreposto, e nenhum elemento fora da viewport. Screenshots das telas críticas.
- Rodar `bun run test:prepublish` e corrigir o que falhar.

## Observações técnicas

- Apenas CSS/JSX de apresentação; nenhuma alteração em hooks de dados, migrations, Edge Functions ou permissões.
- Nenhum campo ou ação será removido — no celular, colunas secundárias vão para o cartão/detalhe, não para o lixo.
- Zoom manual do iOS continua liberado (fonte de campos ≥16px, sem `user-scalable=no`).
- A entrega será incremental: fundação → perfil → tabelas → formulários, com validação por bloco.
