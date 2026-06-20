# Validação da marca "Hora Pro"

> Status: **reservado no produto** (código, manifest, e-mails, landing).
> **Registro oficial pendente** — precisa ser feito por você no INPI.

## 1. Registro de marca (INPI)

Não é possível registrar a marca pelo código. O registro oficial é feito no
**Instituto Nacional da Propriedade Industrial**:

- Site: https://www.gov.br/inpi
- Custo aproximado: **R$ 355** (depósito em uma classe + concessão)
- Prazo: **6 a 18 meses** até concessão final
- Classe recomendada: **Classe 42** (software como serviço — SaaS) e
  **Classe 9** (programa de computador) e **Classe 35** (gestão de negócios)

Antes de depositar, faça **busca de anterioridade** no portal:
https://busca.inpi.gov.br/pePI/

Recomendo um despachante ou advogado de PI para evitar oposições.

## 2. Verificações que você deve fazer manualmente

| Canal | Onde verificar | Status |
| --- | --- | --- |
| INPI (marca BR) | https://busca.inpi.gov.br/pePI/ → "Hora Pro" classe 42 | A fazer |
| Domínio `.com.br` | https://registro.br → `horapro.com.br` | A fazer |
| Domínio `.app` | https://domains.google ou Lovable → `horapro.app` | A fazer |
| Domínio `.com` | https://www.namecheap.com → `horapro.com` | A fazer |
| Google Play | https://play.google.com/store/search?q=hora+pro | A fazer |
| App Store | https://apps.apple.com/br/search?term=hora+pro | A fazer |
| Instagram / TikTok | @horapro / @horaproapp | A fazer |

## 3. Reservado dentro do app

Estes pontos já foram alterados automaticamente:

- `index.html` (title, meta, OG, JSON-LD)
- `vite.config.ts` (manifest PWA)
- `capacitor.config.ts` (appName)
- Páginas: Auth, CadastroCliente, Termos, Política, Unsubscribe, Sidebar, Onboarding
- `public/llms.txt`
- Tabela `interest_leads` para captação na landing

## 4. Domínio

O domínio atual `agendalume.app` continua funcionando. Após comprar
`horapro.app` (ou similar), conecte em **Project Settings → Domains** e
atualize:

- `src/content/brand.ts` (`domain`, `url`)
- `index.html` (canonical e og:url)
- `public/sitemap.xml`

## 5. TODO

- [ ] Buscar "Hora Pro" no INPI (classe 42)
- [ ] Comprar `horapro.app` ou `horapro.com.br`
- [ ] Reservar @horapro nas redes sociais
- [ ] Depositar pedido de marca no INPI
- [ ] Após aprovação, atualizar referências de domínio no código
