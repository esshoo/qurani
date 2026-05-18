const CACHE_NAME = "quran-app-v0.8.3";
const RUNTIME_CACHE = "quran-app-runtime-v0.8.3";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./NOTIFICATIONS.md",
  "./WIRD.md",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./styles/base.css",
  "./styles/layout.css",
  "./styles/reader.css",
  "./styles/modals.css",
  "./styles/notes.css",
  "./styles/sharing.css",
  "./styles/search.css",
  "./styles/test.css",
  "./styles/themes.css",
  "./styles/responsive.css",
  "./src/main.js",
  "./src/core/config.js",
  "./src/core/state.js",
  "./src/core/storage.js",
  "./src/core/dom.js",
  "./src/core/modal-manager.js",
  "./src/core/pwa.js",
  "./src/core/notifications.js",
  "./src/storage/db.js",
  "./src/storage/user-data-store.js",
  "./src/storage/progress-store.js",
  "./src/services/quran-service.js",
  "./src/services/tafsir-service.js",
  "./src/services/audio-service.js",
  "./src/services/search-service.js",
  "./src/features/reader/reader-renderer.js",
  "./src/features/reader/ayah-actions.js",
  "./src/features/tafsir/tafsir-panel.js",
  "./src/features/settings/settings-modal.js",
  "./src/features/notes/notes-modal.js",
  "./src/features/sharing/share-modal.js",
  "./src/features/search/search-modal.js",
  "./src/features/search/search-renderer.js",
  "./src/features/navigation/picker-modal.js",
  "./src/features/wird/daily-wird.js",
  "./src/features/test/test-mode.js",
  "./src/utils/numbers.js",
  "./src/utils/arabic.js",
  "./src/utils/arabic-normalizer.js"
];

const OPTIONAL_ASSETS = [
  "./data/quran.json",
  "./quran.json",
  "./assets/fonts/AmiriQuran.ttf",
  "./assets/fonts/Kitab-Regular.woff2"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(CORE_ASSETS.map(url => cache.add(url)));
    await Promise.allSettled(OPTIONAL_ASSETS.map(url => cache.add(url)));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![CACHE_NAME, RUNTIME_CACHE].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach(client => client.postMessage({ type: "OFFLINE_READY" }));
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // الصوت يظل Online فقط ولا يتم تخزينه.
  if (url.hostname.includes("everyayah.com")) return;

  // التفسير الخارجي لا يخزن افتراضيًا. التفسير المحلي داخل data/tafsir يخزن كأي ملف محلي.
  if (url.hostname.includes("alquran.cloud")) return;

  if (url.origin !== self.location.origin) return;

  const isDataFile = url.pathname.endsWith(".json") || url.pathname.includes("/data/");
  const isNavigation = request.mode === "navigate";

  if (isNavigation) {
    event.respondWith(networkFirst(request, "./index.html"));
    return;
  }

  if (isDataFile) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await putRuntime(request, response.clone());
  return response;
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response && response.ok) await putRuntime(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackUrl) return caches.match(fallbackUrl);
    throw new Error("Offline and no cached response available");
  }
}

async function putRuntime(request, response) {
  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(request, response);
}


self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "./";
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      if ("focus" in client) {
        await client.focus();
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || "حان وقت وردك من القرآن." };
  }
  const title = payload.title || "ورد القرآن اليومي";
  const options = {
    body: payload.body || "حان وقت وردك. دقائق قليلة مع القرآن تكفي لبداية طيبة.",
    dir: "rtl",
    lang: "ar",
    tag: payload.tag || "quran-push-reminder",
    icon: "./assets/icons/icon-192.png",
    badge: "./assets/icons/icon-192.png",
    data: { url: payload.url || "./" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
