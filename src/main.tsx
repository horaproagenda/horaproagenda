import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

// Force clear old caches on load
if ('caches' in window) {
  caches.keys().then((names) => {
    names.forEach((name) => {
      if (name.includes('workbox') || name.includes('precache')) {
        caches.delete(name);
      }
    });
  });
}

// Register service worker with aggressive auto-update
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log("Nova versão disponível, atualizando...");
    // Auto-update without prompt and reload
    updateSW(true).then(() => {
      window.location.reload();
    });
  },
  onOfflineReady() {
    console.log("App ready to work offline");
  },
  onRegisteredSW(swUrl, r) {
    console.log("Service Worker registrado:", swUrl);
    
    // Check for updates immediately
    r?.update();
    
    // Check for updates every 30 seconds
    r && setInterval(() => {
      console.log("Verificando atualizações...");
      r.update();
    }, 30 * 1000);
  },
  onRegisterError(error) {
    console.error("Erro ao registrar Service Worker:", error);
  },
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
