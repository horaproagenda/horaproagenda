# Botão "Hoje" visível na Agenda mobile

## Situação atual (verificada no código)

- Celulares (<480px) usam `MobileAgendaHeader` (`src/components/agenda/MobileAgendaHeader.tsx`).
- Nesse cabeçalho, "Ir para hoje" só existe dentro do menu "Mais ações" (ícone ⋮) — pouco visível. Tocar no rótulo da data também volta a hoje, mas não é descobrível.
- iPads (≥480px) usam o layout padrão, que já possui o botão "Hoje" visível (`src/pages/Agenda.tsx`, linha ~2186). Nenhuma mudança é necessária para tablets/desktop.

## O que será feito

Adicionar um botão "Hoje" sempre visível no cabeçalho mobile da Agenda, na linha de navegação de datas (Row 2), ao lado dos chevrons e do rótulo da data:

```text
[<]   6 out, ter   [>]   [Hoje]
```

Detalhes:

1. **`src/components/agenda/MobileAgendaHeader.tsx`**
   - Novo botão compacto `Button variant="outline" size="sm"` com texto "Hoje" (`h-7 px-2 text-[11px]`, densidade por padding — sem fonte <16px quebrando regras existentes? Não: cabeçalho atual já usa 11–12px em botões, mantido por não ser campo de entrada).
   - Chama o handler `onToday` já existente (que reseta `selectedDate`, `weekStart` e `monthStart` para hoje — `src/pages/Agenda.tsx` linhas 1828–1833), sem duplicar lógica.
   - Quando a data selecionada já é hoje (`isToday`, já calculado no arquivo), o botão fica visível porém desabilitado (`disabled`), evitando mudança de layout entre dias.
   - Alvo de toque ≥28px conforme regras mobile do projeto.
   - O item "Ir para hoje" dentro do menu ⋮ é mantido (redundância inofensiva).

2. **iPad** — sem alteração de código: iPads usam o layout padrão que já exibe o botão "Hoje". Confirmado que `useIsSmartphone` só ativa a visão mobile abaixo de 480px.

3. **Teste de regressão (disciplina anti-regressão do projeto)**
   - Novo teste verificando que `MobileAgendaHeader` renderiza um botão com o texto "Hoje" que chama `onToday`, e que fica desabilitado quando a data selecionada é hoje.
   - Rodar `bun run test:prepublish` conforme `docs/protected-behaviors.md`.

## Não incluído

- Nenhuma mudança no layout desktop/tablet, em `table.tsx` ou em outras telas.
