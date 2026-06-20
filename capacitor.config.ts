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
    contentInset: 'always',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
