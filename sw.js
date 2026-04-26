// 서비스 워커: 아이폰 및 모바일 알림을 위해 필수입니다.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: 'icon.png',
    badge: 'icon.png'
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});
