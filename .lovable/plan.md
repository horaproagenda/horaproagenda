# Nova página inicial do Hora Pro

Refazer a landing page (`src/pages/Landing.tsx`) seguindo a direção aprovada: **"Profissional com mockup de agenda"** — fundo azul profundo, laranja da marca em destaque, fontes Space Grotesk (títulos) e DM Sans (texto), estrutura em camadas de largura total.

## O que muda para o usuário

1. **Barra superior limpa** — apenas o logo e o nome Hora Pro. Os botões "Interesse", "Entrar" e "Criar minha conta" saem do topo (fim do aspecto amador).
2. **Abertura de impacto** — hero em tela cheia com:
   - Selo "Agenda Inteligente" com indicador pulsante;
   - Mensagem principal forte: **"Sua agenda cheia. Seu tempo, seu."** (substitui o texto genérico atual), com destaque em laranja;
   - Subtexto transmitindo profissionalismo e segurança;
   - Botões grandes e chamativos: **"Criar minha conta"** (laranja, com brilho) e **"Entrar"** (contorno); link discreto "Tenho interesse" logo abaixo;
   - Mockup visual de uma agenda ao lado (grade de horários com agendamentos em laranja), transmitindo o produto real.
3. **Diferenciais reais** em camada própria, com ícone, título e descrição curta para cada um:
   - Cadastro do cliente via link, com preenchimento e assinatura de documentos com validade jurídica;
   - Mensagens automáticas via WhatsApp com confirmação automática;
   - Taxa da maquininha calculada automaticamente na baixa do pagamento;
   - Boleto parcelado com aviso de atraso;
   - Documentos com assinatura via Gov.br;
   - Lembretes pessoais e profissionais;
   - Agendamento automático — nenhum cliente fica sem horário e a agenda fica cheia.
4. **Prova de resultados** — faixa com números grandes (+8h economizadas/semana, +37% agendamentos, −68% faltas, 100% tempo real) e depoimentos existentes.
5. **CTA final forte** — bloco laranja de largura total com "Criar minha conta" e "Entrar" bem visíveis, além do formulário "Tenho interesse" (mantido, gravando em `interest_leads` e notificando por e-mail como hoje).
6. **Mantidos**: seções de recursos gerais, público-atendido, FAQ e SEO (title, meta description, canonical, Open Graph) — reestilizados para o novo visual escuro.

## Paleta e tipografia (travadas)

```text
Fundo principal:  #0B1B33   (azul profundo)
Superfícies:      #12294D   (azul médio)
Acento/CTA:       #F97316   (laranja Hora Pro)
Texto:            #E8EEF7   (quase branco)
Títulos: Space Grotesk · Texto: DM Sans
```

Os tokens são adicionados ao `index.css`/`tailwind.config.ts` como utilitários semânticos da landing (ex.: `landing-bg`, `landing-surface`, `landing-accent`) — **sem** alterar o tema claro atual do restante do app.

## Responsividade (regras do projeto)

- Mobile-first: hero em 1 coluna no celular, mockup abaixo do texto; 2 colunas a partir de `lg`.
- `min-h-dvh` no hero (nunca `100vh`); safe-areas respeitadas.
- Botões com alvo de toque ≥44px; fonte dos inputs do formulário de interesse ≥16px (anti-zoom iOS).
- Testado em 390px (iPhone), 768px (tablet) e 1280px+ (desktop/notebook) via Playwright com capturas de tela.

## Detalhes técnicos

- Reescrita de `src/pages/Landing.tsx` mantendo: rotas `/auth` (entrar/criar conta), âncora `#interesse`, `InterestForm` (schema zod, honeypot, insert em `interest_leads`, e-mail de notificação), `Helmet` de SEO e o conteúdo de `src/content/brand.ts` (revisado para incluir todos os diferenciais listados acima).
- Ícones Lucide existentes; sem novas dependências.
- Movimento: reveals suaves ao rolar (CSS/IntersectionObserver simples), hover com micro-elevação nos cards e brilho no CTA.
- Verificação: `bunx tsgo --noEmit`, testes focados, build e capturas Playwright nos 3 tamanhos de tela antes de concluir.
