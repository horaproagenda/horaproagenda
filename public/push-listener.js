/* Avisos do Hora Pro no celular/tablet.
   Este arquivo é importado pelo service worker do app (workbox importScripts),
   por isso funciona com o aplicativo fechado e a tela apagada. */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_err) {
    payload = { title: 'Hora Pro', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Hora Pro';
  const options = {
    body: payload.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    // A tag evita avisos repetidos do mesmo assunto na barra de notificações.
    tag: payload.tag || payload.type || 'hora-pro',
    renotify: false,
    data: { url: payload.url || '/agenda' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/agenda';

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) {
          try {
            await client.navigate(target);
          } catch (_err) {
            /* mantém a tela atual se a navegação não for permitida */
          }
        }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
