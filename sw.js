// Migración: se auto-elimina para ceder el scope a OneSignalSDKWorker.js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => {
  self.registration.unregister();
  self.clients.claim();
});
