import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.a4e333943e1647bf80ca8769296fee7a',
  appName: 'Hora Pro',
  webDir: 'dist',
  server: {
    url: 'https://a4e33394-3e16-47bf-80ca-8769296fee7a.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  ios: {
    // 'never' evita que o WKWebView adicione um inset automático no topo
    // (que somava ao `pt-safe` do AppLayout e criava a faixa branca alta
    // vista em Agenda/Configurações no iPhone). O safe-area passa a ser
    // controlado exclusivamente por CSS (env(safe-area-inset-*)).
    contentInset: 'never',
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: '#F5F1EA',
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#F5F1EA',
  },
};

export default config;
