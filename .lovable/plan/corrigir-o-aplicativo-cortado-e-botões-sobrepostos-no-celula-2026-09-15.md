# Corrigir o aplicativo cortado e botões sobrepostos no celular

## O que está causando os problemas

1. **Tela cortada no iPhone 16 (imagens 1 e 2).** O aviso de teste gratuito é desenhado *fora* da área do aplicativo, que já ocupa a altura inteira da tela. Resultado: o conteúdo é empurrado para baixo e a parte de baixo da tela é perdida, sobra uma faixa branca alta e o texto do aviso fica embaixo do relógio/bateria do iPhone (o aviso não respeita a área reservada do topo).

2. **Botões "Pacotes" e "Consumo" sobrepostos nos detalhes do produto (imagens 3, 4 e 5).** Existe uma regra global no estilo do aplicativo que, no celular, força *qualquer* faixa de 5 ou 6 colunas a virar 2 ou 3 colunas — inclusive as abas. As 5 abas passam a ocupar duas linhas, mas a faixa das abas continua com altura de uma linha só: a segunda linha vaza e escreve por cima do conteúdo. Isso afeta todas as telas com muitas abas ou grades de 5/6 colunas, não só Produtos.

3. **Janelas (detalhes, formulários) cortadas em vários celulares.** Uma regra global limita a altura das janelas usando a medida antiga de altura de tela, que no celular ignora a barra do navegador e o teclado. Isso corta o rodapé com os botões Salvar/Cancelar em Android e iOS.

4. **Textos e alturas forçados por regras globais** (tamanhos com prioridade máxima aplicados a tudo dentro das janelas) deixam rótulos e valores desalinhados e provocam textos que se atropelam em telas estreitas.

## Como vou corrigir

### 1. Aviso do topo dentro do aplicativo
- Colocar o aviso (teste gratuito, carência, renovação) dentro da estrutura de altura total do aplicativo, em coluna: aviso + conteúdo, sem estourar a altura da tela.
- O aviso passa a respeitar a área reservada do topo do celular (notch/ilha dinâmica), com texto em até duas linhas sem cortar.

### 2. Abas seguras em qualquer tela
- Excluir as faixas de abas da regra global de colapso de colunas.
- Padronizar as abas: em telas estreitas elas passam a rolar horizontalmente em uma única linha (com indicação de que há mais abas), em vez de quebrar em duas linhas. A altura acompanha o conteúdo, sem sobreposição.
- Aplicar em todos os lugares com muitas abas: detalhes do produto, perfil do cliente, detalhes do profissional, configurações, caixa, financeiro, relatórios.

### 3. Grades de 5/6 colunas
- Restringir o colapso global apenas a grades de conteúdo (cartões/campos), nunca a barras de abas, barras de ação ou linhas de tabela.
- Onde há grade de botões (ex.: seleção de período/atalhos), usar quebra por espaço disponível, com botões em largura confortável para o dedo.

### 4. Janelas e formulários
- Trocar a limitação de altura global por altura dinâmica que já é usada no aplicativo (acompanha barra do navegador e teclado), garantindo que os botões de ação sempre apareçam.
- Remover as regras de tamanho de texto com prioridade máxima aplicadas indiscriminadamente dentro das janelas, mantendo a densidade por espaçamento (e a fonte dos campos em 16px, para o iOS não dar zoom).

### 5. Varredura e validação em vários aparelhos
- Percorrer as telas principais (Agenda, Clientes, Serviços, Produtos e detalhes, Caixa, Financeiro, Relatórios, Documentos, Cadastros, Configurações, perfil do cliente) nos tamanhos 320×568, 360×740 (Motorola/Samsung básicos), 390×844 (iPhone), 393×873 (Pixel), 412×915 (Xiaomi/Oppo/Vivo) e 768×1024, verificando em cada uma: nada além da largura da tela, nenhum texto ou botão sobreposto, nada cortado no topo nem embaixo. Capturar telas das críticas.
- Corrigir tudo o que a varredura apontar, incluindo problemas ainda não relatados.
- Ampliar os testes de proteção para que a sobreposição de abas e o corte de tela não voltem, e rodar a bateria de testes antes de publicar.

## Observações técnicas

- Mudanças apenas de apresentação: `src/index.css` (regras globais de colapso de grade, altura de diálogo, tipografia forçada), `src/components/ui/tabs.tsx` (faixa de abas rolável e de altura automática), `src/components/ProtectedRoute.tsx` + `src/components/layout/AppLayout.tsx` (aviso dentro do fluxo de altura total, com `pt-safe`), e ajustes pontuais nas telas com abas/grades de 5-6 colunas.
- Nenhuma alteração em banco de dados, permissões, regras financeiras ou lógica de agendamento.
- Altura sempre em `dvh` com desconto de teclado (`--kb-inset`) e áreas seguras via `env(safe-area-inset-*)`; zoom manual do iOS continua liberado.
