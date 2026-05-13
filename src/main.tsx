import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { bootstrapAppearance } from "./hooks/useAppearanceSettings";
import { restoreUrlIfNeeded, scheduleFormRestore } from "./lib/preReloadState";
import { logVersionEvent } from "./lib/appVersionLog";
import { bootVersionGuard } from "./lib/bootVersionGuard";

// Guarda de versão de boot: detecta bundle obsoleto (cache de CDN, SW antigo,
// novo navegador/login com cache local antigo) e força purge + reload ANTES
// do React montar. Roda em paralelo (fire-and-forget) para não bloquear o boot.
void bootVersionGuard();

// Restore URL (route) saved before a version-update reload, so the app
// boots on the same screen the user was viewing — must run BEFORE Router mounts.
restoreUrlIfNeeded();

// Apply persisted appearance (primary color, dark mode, animations) before render
bootstrapAppearance();

// Remove initial loader before React renders
const initialLoader = document.getElementById("initial-loader");
if (initialLoader) {
  initialLoader.remove();
}

// Render React app
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// After React mounts, restore any form state captured before a reload.
scheduleFormRestore();
logVersionEvent('watcher_started', { boot: true });

// Register PWA service worker after React is mounted
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        console.log("Nova versão disponível, atualizando...");
        updateSW(true);
      },
      onOfflineReady() {
        console.log("App ready to work offline");
      },
      onRegisteredSW(swUrl, r) {
        console.log("Service Worker registrado:", swUrl);
        r?.update();
        if (r) {
          setInterval(() => {
            r.update();
          }, 30 * 1000);
        }
      },
      onRegisterError(error) {
        console.error("Erro ao registrar Service Worker:", error);
      },
    });
  });
}

