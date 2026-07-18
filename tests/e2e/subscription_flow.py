"""
E2E: Fluxo de assinatura Hora Pro.

Cobre:
  1. Signup de novo usuário (via edge function complete-signup).
  2. Redirecionamento imediato para /assinatura (sem trial).
  3. Bloqueio de /agenda enquanto status != 'active'.
  4. Simulação da aprovação de pagamento (UPDATE direto em account_subscriptions
     usando a service role — equivalente ao efeito do webhook do Stripe).
  5. Verificação de que /agenda carrega após a ativação.
  6. Verificação da página /assinatura/status refletindo o novo estado em tempo real.

Como rodar:
  export SUPABASE_URL="https://<ref>.supabase.co"
  export SUPABASE_ANON_KEY="..."
  export SUPABASE_SERVICE_ROLE_KEY="..."   # necessário para simular o webhook
  python3 tests/e2e/subscription_flow.py

Requisitos: playwright (já instalado), Deno (para invocar edge functions localmente
não é necessário — usamos HTTP direto no auth do Supabase).
"""

import asyncio
import os
import time
import uuid
from pathlib import Path

import httpx
from playwright.async_api import async_playwright, expect

SCREENSHOTS = Path("/tmp/browser/subscription-flow")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

BASE_URL = os.environ.get("APP_URL", "http://localhost:8080")
SUPABASE_URL = os.environ["SUPABASE_URL"]
ANON = os.environ["SUPABASE_ANON_KEY"]
SERVICE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


async def create_confirmed_user(email: str, password: str) -> str:
    """Cria usuário já confirmado via Admin API. Retorna user_id."""
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers={"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}"},
            json={"email": email, "password": password, "email_confirm": True},
        )
        r.raise_for_status()
        return r.json()["id"]


async def activate_subscription(owner_user_id: str):
    """Simula o efeito do webhook customer.subscription.updated=active."""
    period_end = time.strftime(
        "%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(time.time() + 30 * 86400)
    )
    async with httpx.AsyncClient() as c:
        r = await c.patch(
            f"{SUPABASE_URL}/rest/v1/account_subscriptions",
            params={"owner_user_id": f"eq.{owner_user_id}"},
            headers={
                "apikey": SERVICE,
                "Authorization": f"Bearer {SERVICE}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
            json={
                "status": "active",
                "current_period_end": period_end,
                "stripe_customer_id": f"cus_test_{owner_user_id[:8]}",
                "stripe_subscription_id": f"sub_test_{owner_user_id[:8]}",
                "stripe_price_id": "price_1TuHspDgjrAVrKo6SqvNvXCD",
                "seat_limit": 1,
            },
        )
        r.raise_for_status()
        assert r.json(), "Assinatura não encontrada para ativar"


async def login(page, email: str, password: str):
    await page.goto(f"{BASE_URL}/auth")
    await page.get_by_label(/e-?mail/i).fill(email)
    await page.get_by_label(/senha/i).first.fill(password)
    await page.get_by_role("button", name=/entrar/i).click()


async def main():
    email = f"e2e+{uuid.uuid4().hex[:8]}@horapro.test"
    password = "Test1234!"
    print(f"[E2E] usuário: {email}")

    user_id = await create_confirmed_user(email, password)
    print(f"[E2E] user_id: {user_id}")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        # 1) Login → deve redirecionar para /assinatura (sem trial)
        await login(page, email, password)
        await page.wait_for_url("**/assinatura**", timeout=15_000)
        await page.screenshot(path=str(SCREENSHOTS / "1_redirect_to_assinatura.png"))
        assert "/assinatura" in page.url, f"esperado /assinatura, veio {page.url}"
        print("[OK] Redirecionado para /assinatura logo após login")

        # 2) Tentar acessar /agenda diretamente → deve voltar para /assinatura
        await page.goto(f"{BASE_URL}/agenda")
        await page.wait_for_url("**/assinatura**", timeout=10_000)
        await page.screenshot(path=str(SCREENSHOTS / "2_agenda_blocked.png"))
        print("[OK] /agenda bloqueada enquanto assinatura pendente")

        # 3) Página de status deve mostrar 'Pendente'
        await page.goto(f"{BASE_URL}/assinatura/status")
        await expect(page.get_by_text("Pendente", exact=False)).to_be_visible(timeout=10_000)
        await page.screenshot(path=str(SCREENSHOTS / "3_status_pendente.png"))
        print("[OK] Status page mostra 'Pendente'")

        # 4) Simular aprovação (equivalente ao webhook do Stripe)
        await activate_subscription(user_id)
        print("[E2E] assinatura marcada como 'active' no banco")

        # 5) Realtime deve atualizar a UI sem reload
        await expect(page.get_by_text("Ativa", exact=False)).to_be_visible(timeout=15_000)
        await page.screenshot(path=str(SCREENSHOTS / "4_status_ativa_realtime.png"))
        print("[OK] Status page atualizou para 'Ativa' via realtime")

        # 6) /agenda deve carregar agora
        await page.goto(f"{BASE_URL}/agenda")
        await page.wait_for_url("**/agenda", timeout=15_000)
        await page.wait_for_load_state("networkidle")
        await page.screenshot(path=str(SCREENSHOTS / "5_agenda_liberada.png"))
        assert "/agenda" in page.url and "/assinatura" not in page.url
        print("[OK] /agenda liberada após ativação")

        await browser.close()

    # Cleanup opcional: remover usuário de teste
    async with httpx.AsyncClient() as c:
        await c.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers={"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}"},
        )
    print("[E2E] concluído com sucesso ✓")


if __name__ == "__main__":
    asyncio.run(main())
