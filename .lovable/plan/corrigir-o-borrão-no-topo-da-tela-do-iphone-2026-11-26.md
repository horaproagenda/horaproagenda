# Corrigir o borrão no topo da tela do iPhone

## Causa provável (o que encontrei)
1. **A correção anterior pode não estar no ar.** Ela tirou o desfoque do cabeçalho, mas o app instalado no iPhone usa a versão publicada. Se o app não foi publicado depois, o iPhone continua com a versão antiga.
2. **O próprio iPhone cria o borrão.** O app pede ao iPhone para desenhar a tela por baixo da faixa do relógio e da bateria (modo "translúcido"). Nas versões novas do iOS, o Safari aplica sozinho um efeito de vidro embaçado nessa faixa sobre o que está embaixo. Nenhum ajuste do cabeçalho remove isso, por isso o borrão continuou.
3. **Cor da faixa diferente do app.** A cor declarada para a barra do topo é laranja, enquanto o fundo do app é claro. O iPhone mistura as duas, o que piora a aparência embaçada.

## O que vou mudar
- Trocar o modo da faixa do topo de "translúcido" para "sólido". Assim, o iPhone pinta a faixa do relógio com cor firme e o app começa logo abaixo, sem nada passando por baixo para ser embaçado.
- Usar na faixa do topo a mesma cor clara do fundo do app, também no modo escuro.
- Colocar uma faixa fixa e sólida no topo, do tamanho da área do relógio. Ela serve de reforço para o Safari aberto pelo navegador, e não só pelo app instalado.
- Tirar o desfoque que ainda resta no cabeçalho da página inicial pública e nas páginas de assinatura.
- Fazer o app instalado pegar a versão nova assim que abrir.
- Criar um teste automático que falhe se o modo translúcido ou o desfoque do cabeçalho voltarem.

## Depois de aprovar
- Você precisa **publicar** o app. Depois, feche o app no iPhone e abra de novo. Se ele foi adicionado à tela inicial antes, pode ser preciso removê-lo e adicionar de novo, porque o iPhone guarda a configuração da faixa do topo na hora da instalação.
- Não tenho um iPhone de verdade para conferir aqui.

## Detalhes técnicos
- `index.html`: `apple-mobile-web-app-status-bar-style` de `black-translucent` para `default`; `theme-color` com `media` para claro/escuro, combinando com `--background`; manter `viewport-fit=cover`.
- `manifest` (vite.config.ts): `theme_color`/`background_color` iguais ao fundo.
- `index.css`: elemento fixo `[data-safe-top]` com altura `env(safe-area-inset-top)` e `bg-background` em telas de toque.
- `Landing.tsx`, `Assinatura.tsx`, `AssinaturaStatus.tsx`: fundo sólido no lugar de `backdrop-blur`.
- Teste de regressão em `src/__tests__/regression/` que lê `index.html` e os arquivos citados.
