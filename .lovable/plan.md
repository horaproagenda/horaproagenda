## O que é um VPS com Docker

Um **VPS** (Virtual Private Server) é um servidor Linux alugado na nuvem, com IP público, que fica ligado 24h. **Docker** é a ferramenta que roda a Evolution API dentro de "containers" prontos, sem você instalar dependências manualmente.

Você precisa disso porque a Evolution API precisa estar sempre online para manter a sessão do WhatsApp conectada (QR Code) e receber respostas dos clientes.

**Custo estimado:** R$ 30–60/mês (Hostinger, Contabo, DigitalOcean, Hetzner). Mínimo recomendado: 2 vCPU, 4 GB RAM, 40 GB SSD, Ubuntu 24.04.

---

## Passo 1 — Contratar o VPS e o domínio

1. Contrate um VPS com **Ubuntu 24.04 LTS**. Guarde o **IP público** e a senha de root.
2. No seu provedor de domínio (onde estão `horaproagenda.app` / `agendalume.app`), crie um registro DNS:
   - Tipo: `A` | Nome: `evo` | Valor: `IP_DO_SEU_VPS` | TTL: automático
   - Resultado: `evo.horaproagenda.app` aponta para o servidor.

## Passo 2 — Acessar o servidor

No terminal do seu computador (PowerShell no Windows, Terminal no Mac):

```bash
ssh root@IP_DO_SEU_VPS
```

## Passo 3 — Instalar Docker

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
docker --version
docker compose version
```

## Passo 4 — Criar a pasta e os arquivos da Evolution

```bash
mkdir -p /opt/evolution && cd /opt/evolution
```

Gere sua chave de API (guarde o resultado, será o `EVOLUTION_API_KEY`):

```bash
openssl rand -hex 32
```

Crie o arquivo `.env`:

```bash
nano .env
```

Cole (troque `COLE_SUA_CHAVE_AQUI` pela chave gerada e o domínio pelo seu):

```text
AUTHENTICATION_API_KEY=COLE_SUA_CHAVE_AQUI
SERVER_URL=https://evo.horaproagenda.app
POSTGRES_PASSWORD=troque_esta_senha_forte
```

Salve com `Ctrl+O`, `Enter`, `Ctrl+X`.

Crie o `docker-compose.yml`:

```bash
nano docker-compose.yml
```

```yaml
services:
  evolution:
    image: atendai/evolution-api:v2.1.1
    restart: always
    ports:
      - "8080:8080"
    environment:
      SERVER_URL: ${SERVER_URL}
      AUTHENTICATION_API_KEY: ${AUTHENTICATION_API_KEY}
      AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES: "true"
      DEL_INSTANCE: "false"
      DATABASE_ENABLED: "true"
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/evolution
      DATABASE_SAVE_DATA_INSTANCE: "true"
      DATABASE_SAVE_DATA_NEW_MESSAGE: "true"
      DATABASE_SAVE_MESSAGE_UPDATE: "true"
      CACHE_REDIS_ENABLED: "true"
      CACHE_REDIS_URI: redis://redis:6379/6
      CACHE_REDIS_PREFIX_KEY: evolution
      CACHE_LOCAL_ENABLED: "false"
      QRCODE_LIMIT: "30"
      LOG_LEVEL: ERROR
    volumes:
      - evolution_instances:/evolution/instances
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: evolution
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: always
    volumes:
      - redis_data:/data

volumes:
  evolution_instances:
  postgres_data:
  redis_data:
```

Suba tudo:

```bash
docker compose up -d
docker compose ps
```

## Passo 5 — HTTPS com domínio (obrigatório)

O app só aceita `https`. Instale o Nginx + certificado grátis:

```bash
apt install -y nginx certbot python3-certbot-nginx
nano /etc/nginx/sites-available/evolution
```

```text
server {
    server_name evo.horaproagenda.app;
    client_max_body_size 50M;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/evolution /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d evo.horaproagenda.app --redirect -m seu@email.com --agree-tos -n
```

## Passo 6 — Fechar a porta direta (segurança)

```bash
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

Depois troque no `docker-compose.yml` a linha de portas para `- "127.0.0.1:8080:8080"` e rode `docker compose up -d`.

## Passo 7 — Testar

```bash
curl -s https://evo.horaproagenda.app/instance/fetchInstances \
  -H "apikey: SUA_CHAVE"
```

Deve retornar um JSON (lista vazia `[]` é sucesso).

---

## O que fazer depois (no Lovable)

1. Me avise que o servidor está no ar e eu abro o formulário seguro para você salvar os dois secrets:
   - `EVOLUTION_API_URL` → `https://evo.horaproagenda.app`
   - `EVOLUTION_API_KEY` → a chave gerada no Passo 4
2. Assim que salvos, o app passa a usar a Evolution automaticamente (ela é o provedor preferido quando esses secrets existem) e o UltraMsg fica apenas como fallback.
3. Cada profissional entra em **Configurações → WhatsApp**, clica em conectar e escaneia o QR Code — sem liberação manual e sem custo por instância.
4. Eu valido no fim: geração de QR, envio de lembrete de agendamento e resposta "confirmar"/"cancelar" pelo webhook.

## Detalhes técnicos

- O webhook (`MESSAGES_UPSERT`, `CONNECTION_UPDATE`) é registrado automaticamente pelo app na criação da instância, apontando para a edge function `whatsapp-webhook`; nada a configurar manualmente.
- Cada profissional recebe uma instância própria com nome determinístico `horapro_<id>`, persistida em `professional_whatsapp_credentials` com `provider = 'evolution'`.
- Manutenção: `docker compose logs -f evolution` para logs, `docker compose pull && docker compose up -d` para atualizar. O Certbot renova o certificado sozinho.
