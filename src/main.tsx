import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { bootstrapAppearance } from "./hooks/useAppearanceSettings";

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

