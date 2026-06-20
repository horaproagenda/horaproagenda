## Objetivo

Transformar `/` em uma landing page pública otimizada para SEO, criar onboarding rápido pós-cadastro, publicar o app e registrar no Google Search Console. Sitemap e robots já existem — apenas vou expandir.

---

## 1. Landing page pública em `/`

Hoje `/` está atrás de `ProtectedRoute` e redireciona para `/auth`, o que faz Google e crawlers de IA verem só uma tela de login — péssimo para SEO.

Mudanças:

- Criar `src/pages/Landing.tsx` — página pública, server-friendly (sem dados autenticados), focada nas keywords: **"app de agendamento"**, **"agenda para clínica de estética"**, **"sistema de agendamento online"**, **"agenda para salão de beleza"**, **"software para esteticista"**.
- Estrutura semântica:
  - `<header>` com logo + botões "Entrar" / "Criar conta grátis"
  - `<main>` com:
    - Hero (H1 com keyword principal, CTA, screenshot do app)
    - Seção de features (agenda, clientes, financeiro, WhatsApp, pacotes, comissões)
    - Para quem é (clínicas de estética, salões, esteticistas, barbearias, podólogos…)
    - Depoimentos / prova social (placeholder)
    - FAQ (já temos JSON-LD pra isso — espelhar visualmente)
    - CTA final
  - `<footer>` com links para Termos, Privacidade, login
- Roteamento: alterar `App.tsx` para que:
  - `/` → `Landing` (público) **se usuário não autenticado**
  - `/` → `Index` (dashboard atual) **se autenticado**
  - Renomear rota interna para `/dashboard` apontando para o `Index` atual (com redirect de compat)
- `<Helmet>` por rota com `react-helmet-async` para title/description/canonical/OG específicos da landing (instalar a lib).
- Imagens: usar screenshots reais do app já existentes ou um hero gerado via imagegen com background sólido. Alt text com keywords.
- Design: seguir o design system atual (Poppins, tokens semânticos do `index.css`) — nada de roxo/branco genérico de IA.

## 2. Onboarding rápido pós-signup

Hoje, ao criar conta, o usuário cai direto no dashboard vazio — alta chance de abandono.

Fluxo novo `src/components/onboarding/OnboardingWizard.tsx` (modal full-screen, 3 steps):

1. **Dados da clínica** — nome do negócio, telefone, segmento (estética, salão, barbearia, podologia, outros). Salva em `business_settings`.
2. **Primeiro profissional** — nome, especialidade. Pré-preenchido com dados do owner. Salva em `professionals`.
3. **Primeiro serviço** — nome, duração, preço. Salva em `services`.

Ao final: toast de boas-vindas + redirect para `/agenda`.

Gatilho: hook `useOnboardingStatus` checa se `business_settings.onboarding_completed_at IS NULL` (campo novo) **e** se não há profissionais/serviços. Migration para adicionar a coluna.

Pula: botão "Pular por enquanto" salva `onboarding_completed_at = now()` mesmo assim, pra não reaparecer.

## 3. SEO técnico

- **`public/sitemap.xml`** — adicionar `/` (landing) já está; manter `/auth`, termos, privacidade. Adicionar `<lastmod>`.
- **`public/robots.txt`** — já está OK; só confirmar que `Disallow` não bloqueia rotas internas (não bloqueia, então tudo bem; rotas autenticadas não vazam dados pra crawler porque são SPA atrás de auth).
- **`index.html`** — manter os JSON-LD existentes (Organization, WebSite, SoftwareApplication, FAQPage).
- **Search Console** — usar o connector `google_search_console` para gerar token de verificação META, injetar no `<head>` e chamar verify para o domínio `https://agendalume.app/`. Adicionar o site verificado à lista do GSC.

## 4. Publicação

Após as mudanças acima, chamar `preview_ui--publish` apontando para `agendalume.app`.

---

## Detalhes técnicos

- Lib nova: `react-helmet-async` (per-route head tags).
- Migration: `ALTER TABLE business_settings ADD COLUMN onboarding_completed_at timestamptz`.
- Sem mudanças em RLS (campo herda policies existentes).
- Nenhuma quebra de rota: `/` continua respondendo, só com conteúdo diferente conforme auth.

---

## Fora de escopo (deixar claro)

- **Não posso garantir** ranking em "app de agendamento" no Google/ChatGPT/Gemini — depende de autoridade, backlinks e tempo. As mudanças tornam o app **elegível e bem descrito**, mas o resto é trabalho contínuo de SEO/conteúdo.
- **Play Store / App Store**: o `capacitor.config.ts` já está pronto. Submissão exige contas pagas (Google $25, Apple $99/ano) e build nativo no seu Mac/Android Studio — sai do escopo desta entrega.
- Bing Webmaster Tools: requer verificação manual sua (não há connector).

---

Aprova esse escopo?