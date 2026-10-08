// Service Worker — GIC AEPT PWA
// Incrémentez CACHE_VERSION à chaque mise à jour de l'app pour forcer le rafraîchissement du cache.
const CACHE_VERSION = "v33";
const APP_SHELL_CACHE = `gic-aept-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `gic-aept-runtime-${CACHE_VERSION}`;

const APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

// Installation : mise en cache de la coquille applicative
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

// Activation : suppression des anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Stratégie de fetch (v33) :
// - Pages (navigation) : réseau d'abord ; chaque page est gardée SOUS SA PROPRE ADRESSE (jamais à la place de index.html).
//   Hors ligne : on montre la même page si elle est en mémoire ; l'application (/ ou /index.html) se replie sur index.html ;
//   toute autre page inconnue affiche un message « hors ligne » (jamais la page d'une autre).
// - Autres fichiers du site (affiliation.js, icônes, PDF...) : réseau d'abord, copie gardée pour le mode hors ligne.
// - Bibliothèques CDN (React, Babel, jsPDF...) : cache-first avec mise à jour en arrière-plan (inchangé).
const OFFLINE_PAGE = () =>
  new Response(
    "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
      "<title>Hors ligne</title><body style='font-family:sans-serif;padding:24px;text-align:center'>" +
      "<h2>Pas de connexion internet</h2><p>Cette page n'est pas encore disponible hors ligne.<br>Reconnectez-vous puis r\u00e9essayez.</p></body>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
const isHtmlResponse = (r) => (r.headers.get("content-type") || "").includes("text/html");
// Clé de cache d'une page : adresse sans « ?ref=... » (une seule copie par page)
const pageKey = (url) => url.origin + url.pathname;

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = request.mode === "navigate";

  if (isNavigation && isSameOrigin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // On ne garde que les pages chargées correctement (pas d'erreur, pas de redirection)
          if (response && response.status === 200 && !response.redirected) {
            const clone = response.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => cache.put(pageKey(url), clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(pageKey(url)).then((cached) => {
            if (cached) return cached;
            const isApp = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
            if (!isApp) return OFFLINE_PAGE();
            return caches.match("./index.html").then((shell) => shell || OFFLINE_PAGE());
          })
        )
    );
    return;
  }

  if (isSameOrigin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Copie de secours : seulement un vrai fichier (200), jamais une page HTML renvoyée à la place d'un script
          const wantsHtml = request.destination === "document" || request.destination === "iframe";
          if (response && response.status === 200 && !request.headers.has("range") && (wantsHtml || !isHtmlResponse(response))) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match(request, { ignoreSearch: true }))
            .then((cached) => cached || Response.error())
        )
    );
    return;
  }

  // Ressources externes (CDN) : stale-while-revalidate
  event.respondWith(
    caches.open(RUNTIME_CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});
