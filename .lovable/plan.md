
# Rebrand: Lume Agenda → Hora Pro

## Importante sobre "registro de marca"
Não consigo registrar a marca "Hora Pro" juridicamente — registro de marca é feito no **INPI** (https://www.gov.br/inpi). Posso:
- Verificar disponibilidade básica via busca web (INPI, domínios, app stores).
- Reservar o nome no produto (código, metadados, manifest, e-mails, domínio interno).
- Gerar um documento `.md` com instruções para você dar entrada no INPI.

O registro oficial precisa ser feito por você (ou um despachante) no INPI — custa ~R$ 355 e leva meses.

## 1. Validação do nome
- Buscar "Hora Pro" / "HoraPro" no INPI, Google Play, App Store, domínios `.com.br`, `.app`, `.com`.
- Entregar relatório em `BRAND_VALIDATION.md` com status e recomendação (ex.: usar `horapro.app` se `horapro.com.br` estiver ocupado).
- Se o nome estiver tomado em pontos críticos, te aviso antes de prosseguir.

## 2. Identidade visual (logo + paleta)
- Gerar logotipo Hora Pro com `imagegen` (premium, transparente):
  - Marca principal (horizontal: ícone + wordmark)
  - Ícone isolado (favicon / app icon — quadrado, fundo sólido + variante transparente)
  - Versão monocromática (preto / branco)
- Paleta proposta (a confirmar): primária âmbar/laranja quente (energia + tempo) + neutros profundos. Definida via tokens semânticos em `src/index.css` (HSL), com modo claro e escuro.
- Substituir favicon, ícones PWA e ativos em `public/` e `src/assets/`.

## 3. Rename global (Lume Agenda → Hora Pro)
Substituições verificadas via `rg "Lume Agenda|LumeAgenda|agendalume"`:
- `index.html` (title, meta description, OG, Twitter, JSON-LD)
- `public/manifest.webmanifest` (name, short_name, description)
- `public/llms.txt`, `public/robots.txt`, `public/sitemap.xml`
- `src/pages/Landing.tsx` e demais páginas (`Auth`, `TermosDeServico`, `PoliticaDePrivacidade`, etc.)
- `src/components/layout/Header.tsx` e sidebar
- Templates de e-mail em `supabase/functions/_shared/email-templates/*` e `transactional-email-templates/*`
- Edge functions que enviem texto com a marca (`send-transactional-email`, `send-appointment-reminders`, `whatsapp-*`)
- `README.md`, `capacitor.config.ts` (appName, appId — manter bundle id atual para não quebrar instalações existentes; só ajusto display name)
- Memórias do projeto (`mem://index.md` core)
- `package.json` (name)

Domínio: `agendalume.app` continua funcionando (não dá pra trocar custom domain pelo código). Adicionar TODO em `BRAND_VALIDATION.md` para você comprar `horapro.app` (ou similar) e conectar via Settings → Domains.

## 4. Taglines (5 opções) + descrição
Entregue em `src/content/brand.ts` (reutilizado na landing) e `BRAND_COPY.md`:
- 5 taglines curtas (≤6 palavras), ex.: "Sua hora, no controle.", "Agenda profissional, sem atrito.", etc.
- 1 descrição curta (≤160 chars) para meta/App Store subtitle.
- 1 descrição longa (~400 palavras) para landing, Play Store e App Store, com benefícios, público e CTA.

## 5. Landing page pública
Reescrever `src/pages/Landing.tsx` (rota `/`, já pública) com nova marca:
- Hero com logo Hora Pro + tagline escolhida + CTA duplo (interesse + criar conta).
- Seção "Benefícios" (6 cards: agenda em tempo real, WhatsApp, financeiro, pacotes, multiusuário, PWA).
- Seção "Para quem é" (públicos).
- **Formulário de interesse** novo: nome, e-mail, WhatsApp, área de atuação, mensagem.
  - Salva em nova tabela `public.interest_leads` (Lovable Cloud / Supabase) com RLS:
    - `INSERT` permitido para `anon` (formulário público).
    - `SELECT/UPDATE/DELETE` apenas para `super_admin` via `has_role`.
    - GRANTs explícitos conforme padrão do projeto.
  - Honeypot + rate-limit por IP simples (campo `created_at` + check no client).
- FAQ atualizado com novo nome.
- Footer com nova marca.
- Helmet: title, description, canonical, OG/Twitter atualizados para Hora Pro.

## 6. Validação final
- `rg -i "lume agenda|lumeagenda|agendalume"` deve retornar zero matches em código (exceto changelog/migrations históricas).
- Build verde, preview carrega `/` com nova marca, formulário de interesse insere linha em `interest_leads`.
- Atualizar `mem://index.md` (Core) com "Marca: Hora Pro".

## Arquivos criados/alterados (resumo)
- Novos: `src/content/brand.ts`, `BRAND_VALIDATION.md`, `BRAND_COPY.md`, `src/assets/horapro-logo.png`, `src/assets/horapro-icon.png`, migration `interest_leads`.
- Editados: `index.html`, `public/manifest.webmanifest`, `public/llms.txt`, `public/sitemap.xml`, `public/favicon.*`, `src/index.css` (tokens), `tailwind.config.ts` (se preciso), `src/pages/Landing.tsx`, headers/sidebars, e-mail templates, `README.md`, `capacitor.config.ts`, `package.json`, `mem://index.md`.

## Perguntas antes de implementar
1. **Paleta** — posso seguir com âmbar/laranja quente + neutros, ou prefere outra direção (azul corporativo, verde, roxo)?
2. **Domínio** — mantenho `agendalume.app` no código por enquanto e te deixo TODO pra comprar `horapro.app`, ou você já tem domínio definido?
3. **Formulário de interesse** — quer notificação por e-mail a cada novo lead (via edge function existente `send-transactional-email`)?
