import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

// Register service worker with auto-update
const updateSW = registerSW({
  onNeedRefresh() {
    // Auto-update without prompt
    updateSW(true);
  },
  onOfflineReady() {
    console.log("App ready to work offline");
  },
  onRegisteredSW(swUrl, r) {
    // Check for updates every 60 seconds
    r && setInterval(() => {
      r.update();
    }, 60 * 1000);
  },
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
