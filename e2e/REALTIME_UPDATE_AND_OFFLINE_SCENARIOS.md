# E2E — Atualização em Tempo Real & Modo Offline

Cenários para validar o fluxo de auto-update do PWA (toast → SKIP_WAITING →
reload) e o fallback offline com fila persistente. Pensado para Playwright,
mas aplicável a QA manual em celular, tablet e navegador desktop.

## Pré-requisitos

- Build de produção publicado (`npm run build` + deploy).
- PWA instalada no dispositivo (Adicionar à Tela Inicial em iOS/Android,
  ou ícone de instalação no Chrome desktop).
- DevTools → Application → Service Workers acessível.

---

## 1. Atualização automática (PWA + abas abertas)

### 1.1 Detecta nova versão e mostra toast
1. Abrir o app em duas abas do navegador (A e B).
2. Publicar uma nova versão (alterar qualquer string visível no UI).
3. Em até **60 segundos** (polling do `useAppUpdater`) cada aba deve:
   - Exibir toast: **"Nova versão disponível!"**
   - Mostrar botão **"Atualizar agora"**.
4. Verificar logs do console: `Service Worker registrado:` e a chamada
   automática `r.update()`.

### 1.2 SKIP_WAITING + reload automático
1. Sem clicar em nada, aguardar ~4 segundos após o toast.
2. A página deve recarregar automaticamente nas duas abas.
3. Após reload, a nova versão (string alterada) deve aparecer.

### 1.3 Atualização manual via botão
1. Repetir 1.1.
2. Clicar em **"Atualizar agora"** imediatamente.
3. A aba deve recarregar em < 1 segundo.

### 1.4 PWA instalada no celular
1. Instalar o app no Android/iOS.
2. Publicar nova versão enquanto a PWA está em segundo plano.
3. Trazer a PWA ao foco → o evento `visibilitychange` força `update()`
   → toast aparece → reload automático.

### 1.5 Múltiplos dispositivos simultâneos
1. Abrir em desktop + celular + tablet (mesma sessão).
2. Publicar nova versão.
3. **Todos** os dispositivos devem atualizar dentro de 60s sem
   intervenção manual.

### Playwright
```ts
test('toast de nova versão aparece em até 60s', async ({ page }) => {
  await page.goto('/');
  // simula nova versão via injeção
  await page.evaluate(() => {
    const reg = { waiting: { postMessage: () => {} } };
    window.dispatchEvent(new CustomEvent('test:newVersion', { detail: reg }));
  });
  await expect(page.getByText('Nova versão disponível!')).toBeVisible({
    timeout: 65_000,
  });
});
```

---

## 2. Modo offline — UI continua funcionando

### 2.1 Detecta perda de conexão
1. DevTools → Network → **Offline**.
2. Toast warning: **"Você está offline"** com descrição
   *"A interface continua funcionando..."*.
3. Badge **Offline** deve aparecer no header (vermelho, ícone CloudOff).

### 2.2 Navegação offline
1. Com conexão cortada, navegar entre Agenda, Clientes, Financeiro.
2. As páginas devem renderizar a partir do cache do React Query e do
   Service Worker. Sem tela em branco.

### 2.3 Volta a conexão
1. DevTools → Network → **Online**.
2. Toast: **"Conexão restabelecida"**.
3. Badge offline desaparece.
4. React Query refaz `invalidateQueries` global → dados se reidratam.

### Playwright
```ts
test('mostra badge offline quando perde conexão', async ({ page, context }) => {
  await page.goto('/');
  await context.setOffline(true);
  await expect(page.getByText('Offline')).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('Offline')).not.toBeVisible({ timeout: 5000 });
});
```

---

## 3. Fila de mutações offline

### 3.1 Enfileiramento
1. Ficar offline (Network → Offline).
2. Executar uma ação de mutação que use `enqueue()` (ex: criar nota).
3. Verificar `localStorage["app:offlineQueue:v1"]` → contém a operação.
4. Badge no header deve mostrar contador `N pendente(s)`.

### 3.2 Sincronização ao reconectar
1. Voltar online.
2. Toast: **"Sincronizando alterações pendentes..."**.
3. Toast de sucesso: **"N alteração(ões) sincronizada(s)"**.
4. `localStorage` deve estar vazio.
5. UI reflete a operação como confirmada.

### 3.3 Retry com falha
1. Forçar handler a falhar (ex: payload inválido).
2. A operação deve permanecer na fila com `attempts` incrementado.
3. Após 5 tentativas falhas, é descartada e toast de erro é exibido.

### 3.4 Sincronização manual
1. Com fila pendente e online, clicar no badge **N pendente(s)** no header.
2. Sync deve disparar imediatamente, sem esperar próximo evento `online`.

---

## 4. Cenários cruzados

### 4.1 Update durante offline
1. Ficar offline.
2. Publicar nova versão (cabo desligado).
3. Voltar online.
4. Em até 60s: toast de nova versão aparece + reload automático.
5. Após reload, fila offline ainda é processada (não é perdida — está
   em `localStorage`).

### 4.2 Reload preserva fila
1. Enfileirar 3 operações offline.
2. Recarregar a página (F5).
3. Após reload, badge ainda mostra **3 pendente(s)**.
4. Voltar online → todas processadas.

### 4.3 Multi-aba — mesma fila
1. Abrir 2 abas, ficar offline em ambas.
2. Enfileirar operação na aba A.
3. Voltar online na aba B.
4. A aba B processa a fila (ambas leem o mesmo `localStorage`).
5. Aba A é notificada via `subscribeQueue` (storage event ou re-render).

---

## 5. Cobertura de testes unitários (já implementados)

| Arquivo | Cenários |
|---|---|
| `src/lib/offlineQueue.test.ts` | 9 testes — enqueue, persistência, FIFO, retry, MAX_ATTEMPTS, processamento parcial |
| `src/hooks/useAppUpdater.test.ts` | 4 testes — polling 60s, updatefound + SKIP_WAITING, waiting inicial, controllerchange |
| `src/hooks/useOfflineSync.test.ts` | 5 testes — estado inicial, eventos online/offline, contador, processamento via handler, retry em falha |

**Total: 18 testes passando** (`bunx vitest run`).
