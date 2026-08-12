# Documentos: preservar formatação, imagens, data por extenso e horário

## Problemas confirmados

1. **Formatação e imagens são descartadas no preenchimento.** O editor de modelos salva HTML rico (negrito, cores, imagens em `<img class="rte-image">`), mas o preenchimento converte tudo para texto puro (`htmlToPlainText` em `FillDocumentDialog`, `PreencherDocumento` e `InteractiveDocumentFiller`). O documento salvo em `client_documents.content` já é texto sem marcação.
2. **A visualização e o PDF só mostram texto.** `ClientDocumentViewDialog` renderiza o conteúdo dentro de `<pre>` e o PDF é gerado linha a linha com jsPDF (`clientDocumentPdf.ts`), sem suporte a estilo ou imagem. Além disso o sanitizador atual (`sanitizeHtmlContent`) remove o atributo `style`, o que apagaria as cores mesmo se o HTML fosse mantido.
3. **`{data_extenso}` sai numérica no autocadastro.** Em `CadastroCliente.tsx` o valor de `data_extenso` recebe `new Date().toLocaleDateString('pt-BR')` (ex.: 12/08/2026) em vez do formato "12 de agosto de 2026".
4. **Divergência de horário.** Cada tela calcula a hora por conta própria e em momentos diferentes (`toLocaleTimeString` no autocadastro, `format(new Date(), 'HH:mm')` no preenchimento), sem fuso fixo, então o `{hora}` do corpo do documento não coincide com o horário/descrição registrados no salvamento.

## O que será feito

### 1. Pipeline de preenchimento com HTML
- Novo módulo `src/lib/documentRichContent.ts`:
  - `fillDocumentHtml(html, values)`: percorre apenas os nós de texto do HTML e substitui `{variavel}`, respostas Sim/Não, caixas de seleção e campos livres, mantendo intactas as tags de formatação, cores e imagens.
  - `isRichDocument(content)`: detecta se um documento é HTML ou texto legado.
  - `sanitizeRichDocumentHtml(html)`: sanitização própria para documentos, permitindo `<img>` (incluindo `data:` de imagem), `<b>/<strong>/<i>/<u>`, títulos, listas, tabelas e um whitelist de estilos (`color`, `background-color`, `font-weight`, `font-style`, `text-decoration`, `text-align`, `font-size`, `width`, `max-width`, `height`, `margin`).
- `FillDocumentDialog`, `PreencherDocumento` (link público), `InteractiveDocumentFiller` e `CadastroCliente` passam a gerar o conteúdo final em HTML preservado; o texto puro continua sendo derivado apenas para pré-visualizações curtas (WhatsApp/e-mail).
- Documentos antigos em texto puro continuam funcionando (fallback automático).

### 2. Visualização, impressão e PDF fiéis
- `ClientDocumentViewDialog`: renderiza HTML sanitizado (mantendo `<pre>` só para conteúdo legado), com estilos de página A4.
- PDF: gerar a partir do HTML renderizado (captura em canvas com paginação A4) em `clientDocumentPdf.ts`, mantendo cabeçalho (cliente, CPF, nascimento, profissional), imagens, negrito e cores, e mantendo o caminho jsPDF atual para documentos legados de texto.
- A impressão/janela de print usa o mesmo sanitizador rico, para que o que o cliente recebe seja igual ao que foi editado.

### 3. Data por extenso unificada
- Helper único `formatDateExtended` / `formatTimeSaoPaulo` em `src/lib/documentTemplateFields.ts`, usado por todas as telas.
- `{data_extenso}` sempre "12 de agosto de 2026"; `{data}`/`{data_atual}` seguem em `dd/MM/yyyy`; opcionalmente `{data_extenso}` com dia da semana quando o modelo usar `{data_extenso_completa}`.
- Correção direta no autocadastro (`CadastroCliente.tsx`).

### 4. Horário consistente
- Um único instante ("carimbo de preenchimento") é capturado no momento do envio e reutilizado para `{data}`, `{hora}`, `{data_extenso}`, para a descrição do documento e para o registro salvo, sempre no fuso America/Sao_Paulo (via helpers existentes de `src/lib/timezone.ts`).
- A descrição gerada no autocadastro passa a usar esse mesmo carimbo, eliminando a divergência com o corpo do documento.

### 5. Testes
- Testes unitários para `fillDocumentHtml` (negrito/cor/imagem preservados, variáveis substituídas), `sanitizeRichDocumentHtml` (script removido, `style` permitido em whitelist) e para a data por extenso/horário.
- Verificação no navegador: criar modelo com negrito, texto colorido e imagem, preencher pelo link público e pelo autocadastro, e conferir visualização, PDF e envio.

## Notas técnicas
- Sem alterações de banco: `client_documents.content` passa a armazenar HTML sanitizado; a detecção de conteúdo legado é feita em tempo de leitura.
- A sanitização acontece na escrita e na leitura, para proteger tanto documentos novos quanto os já salvos.
