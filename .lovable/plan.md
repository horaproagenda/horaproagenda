# Instalar na tela inicial + compartilhar link do app

## O que o usuário verá

### 1. Botão "Instalar aplicativo" na Agenda
- Aparece no topo da página Agenda (ao lado dos outros botões de ação), tanto no celular quanto no notebook.
- No Android/Chrome/Edge (celular e computador): um toque instala o app na tela inicial ou na barra de tarefas, sem o usuário procurar menu.
- No iPhone/Safari (que não permite instalação automática): abre um passo a passo curto e ilustrado — "Compartilhar → Adicionar à Tela de Início".
- O botão desaparece definitivamente depois de instalado (ou depois de o usuário concluir/dispensar o passo a passo), e nunca aparece quando o app já está aberto em modo instalado.

### 2. Botão "Compartilhar link do aplicativo" no Painel do Administrador
- Novo bloco no painel com o endereço atual do aplicativo visível.
- Um clique copia o link e mostra a confirmação "Link copiado".
- No celular, também usa o compartilhamento do sistema (WhatsApp, e-mail etc.) quando disponível, com uma mensagem curta de convite.

## Detalhes técnicos

- O app já tem manifesto instalável (`public/manifest.webmanifest`, `display: standalone`, ícones 192/512/maskable) e as tags no `index.html`. Nenhum service worker será adicionado: instalação na tela inicial é suportada pelo manifesto.
- Novo hook `src/hooks/useInstallPrompt.ts`:
  - captura `beforeinstallprompt` (guardado em ref, `preventDefault`), expõe `canInstall`, `isInstalled`, `isIOS`, `promptInstall()`.
  - detecta instalado por `matchMedia('(display-mode: standalone)')`, `navigator.standalone` e evento `appinstalled`.
  - persiste em `localStorage` (`app-install-dismissed` / `app-install-done`) para o botão não voltar.
  - não renderiza nada dentro de iframe (preview do Lovable) nem quando já instalado.
- Novo componente `src/components/pwa/InstallAppButton.tsx` (botão + `Dialog` com instruções iOS) usando os componentes de UI e tokens existentes.
- Integração: renderizar `InstallAppButton` nas ações do cabeçalho de `src/pages/Agenda.tsx`.
- Novo componente `src/components/admin/ShareAppLinkCard.tsx`: usa `window.location.origin` (link publicado atual), `navigator.clipboard.writeText` com fallback `document.execCommand('copy')` e `navigator.share` quando existir; feedback pelo `toast` humanizado do projeto.
- Integração: incluir o card em `src/pages/AdminPanel.tsx` (aba de gestão/assinatura já existente, no topo do conteúdo do painel).
- Testes de regressão em `src/__tests__/regression/`: botão oculto quando instalado/dispensado, e cópia de link chamando clipboard com a origem atual.

## Fora do escopo
- Nenhum modo offline, service worker ou publicação em App Store/Play Store (isso exigiria um app nativo, caminho separado).
