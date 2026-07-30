# Evolution API — Guia completo de instalação em VPS com Docker

Este guia deixa o WhatsApp gratuito (QR Code por profissional) funcionando no Hora Pro.

---

## O que é um VPS com Docker

- **VPS** (Virtual Private Server): um servidor Linux alugado na nuvem, com IP público, ligado 24h.
- **Docker**: roda a Evolution API em containers prontos, sem instalar dependências manualmente.

A Evolution precisa ficar sempre online para manter a sessão do WhatsApp conectada e receber as respostas dos clientes ("confirmar" / "cancelar").

**Custo estimado:** R$ 30–60/mês (Hostinger, Contabo, DigitalOcean, Hetzner).
**Mínimo recomendado:** 2 vCPU, 4 GB RAM, 40 GB SSD, Ubuntu 24.04 LTS.

---

## Passo 1 — Contratar VPS e apontar o domínio

1. Contrate um VPS com **Ubuntu 24.04 LTS**. Guarde o **IP público** e a senha de `root`.
2. No provedor do seu domínio, crie o registro DNS:

| Tipo | Nome | Valor            |
| ---- | ---- | ---------------- |
| A    | evo  | `IP_DO_SEU_VPS`  |

Resultado: `evo.horaproagenda.app` aponta para o servidor.

---

## Passo 2 — Acessar o servidor

```bash
ssh root@IP_DO_SEU_VPS
```

---

## Passo 3 — Instalar o Docker

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
docker --version
docker compose version
```

---

## Passo 4 — Criar os arquivos da Evolution

```bash
mkdir -p /opt/evolution && cd /opt/evolution
openssl rand -hex 32   # guarde este valor: será o EVOLUTION_API_KEY
```

### `.env`

```bash
nano .env
```

```text
AUTHENTICATION_API_KEY=COLE_SUA_CHAVE_AQUI
SERVER_URL=https://evo.horaproagenda.app
POSTGRES_PASSWORD=troque_esta_senha_forte
```

Salvar: `Ctrl+O`, `Enter`, `Ctrl+X`.

### `docker-compose.yml`

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

```bash
docker compose up -d
docker compose ps
```

---

## Passo 5 — HTTPS (obrigatório)

```bash
apt install -y nginx certbot python3-certbot-nginx
nano /etc/nginx/sites-available/evolution
```

```nginx
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

---

## Passo 6 — Segurança (firewall + porta interna)

```bash
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

No `docker-compose.yml`, troque a porta para `- "127.0.0.1:8080:8080"` e rode `docker compose up -d`.

---

## Passo 7 — Testar

```bash
curl -s https://evo.horaproagenda.app/instance/fetchInstances -H "apikey: SUA_CHAVE"
```

Retorno JSON (mesmo `[]`) = sucesso.

---

## O que fazer depois, no aplicativo

1. Salvar os secrets do projeto:
   - `EVOLUTION_API_URL` → `https://evo.horaproagenda.app`
   - `EVOLUTION_API_KEY` → a chave do Passo 4
2. O app passa a usar a Evolution automaticamente (provedor preferido quando os dois secrets existem); o UltraMsg vira fallback.
3. Cada profissional acessa **Configurações → WhatsApp**, conecta e escaneia o QR Code — sem liberação manual e sem custo por instância.
4. Validar: geração de QR, envio de lembrete e resposta "confirmar"/"cancelar".

## Notas técnicas

- O webhook (`MESSAGES_UPSERT`, `CONNECTION_UPDATE`) é registrado automaticamente na criação da instância, apontando para a edge function `whatsapp-webhook`.
- Cada profissional recebe instância própria `horapro_<id>`, persistida em `professional_whatsapp_credentials` com `provider = 'evolution'`.
- Manutenção: `docker compose logs -f evolution` (logs) e `docker compose pull && docker compose up -d` (atualizar). O Certbot renova o SSL sozinho.
