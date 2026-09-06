// =====================================================================
// המשימות שלי — Service Worker
// שומר Cache בסיסי של קבצי האפליקציה כדי שהיא תיפתח גם עם חיבור חלש/ללא
// חיבור. נתוני המשימות עצמם מגיעים מ-Supabase ולא מנוהלים כאן.
// =====================================================================

const CACHE_NAME = "hamesimot-sheli-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./supabase.js",
  "./config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // בקשות לרשת חיצונית (Supabase, גופנים, CDN) - תמיד מהרשת, בלי Cache
  if (url.origin !== self.location.origin) {
    return;
  }

  // קבצי האפליקציה עצמה - Cache First עם fallback לרשת
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => cached);
    })
  );
});
