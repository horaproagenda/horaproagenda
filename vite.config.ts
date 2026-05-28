import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    // Optimize CSS to reduce render blocking
    cssCodeSplit: true,
    cssMinify: true,
    rollupOptions: {
      output: {
        // Optimize chunk splitting for better loading
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
        // Nomes determinísticos com hash de conteúdo: garante que cada
        // alteração gere um novo arquivo e que o SW nunca sirva conteúdo
        // de uma página por outra (ex.: clicar em "Clientes" carregar Serviços).
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: true,
      },
      includeAssets: ["favicon.ico", "og-image.png"],
      manifest: {
        name: "Lume Agenda - Beleza com Elegância",
        short_name: "Lume Agenda",
        description: "Sistema completo de agendamento para clínicas de estética",
        theme_color: "#1a1a2e",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Pré-cacheia somente arquivos estáveis (ícones, manifest, fontes).
        // JS e CSS com hash NÃO entram no precache: cada deploy muda o hash,
        // e precache cruzado entre versões podia fazer o navegador servir o
        // chunk errado (clicar em "Clientes" e abrir "Serviços", etc.).
        globPatterns: ["**/*.{ico,png,svg,woff2}"],
        globIgnores: ["**/assets/**"],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // HTML sempre via rede (com fallback de cache curto) -> qualquer
        // novo deploy é entregue imediatamente em todos os dispositivos.
        navigateFallback: null,
        runtimeCaching: [
          {
            // Documentos HTML / navegações
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-cache",
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 5, maxAgeSeconds: 60 },
            },
          },
          {
            // Chunks de aplicação (JS/CSS sob /assets/). NetworkFirst garante
            // que a versão mais recente sempre seja buscada; o cache só é
            // usado como fallback offline. Imune ao bug de "rota errada
            // ao clicar" causado por chunks antigos no precache.
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith("/assets/") &&
              (request.destination === "script" || request.destination === "style"),
            handler: "NetworkFirst",
            options: {
              cacheName: "app-assets",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            // Realtime do Supabase NUNCA deve passar pelo SW
            urlPattern: /^https:\/\/.*\.supabase\.co\/realtime\/.*/i,
            handler: "NetworkOnly",
          },
          {
            // Auth / RPC / functions / storage devem ir direto na rede
            // para não retornarem dados velhos em outras abas/dispositivos.
            urlPattern: /^https:\/\/.*\.supabase\.co\/(auth|rest|functions|storage)\/.*/i,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
