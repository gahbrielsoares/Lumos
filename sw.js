// Lumos: funcionamento sem internet (service worker)
// Estratégia "internet primeiro": com conexão, sempre busca a versão nova do site e guarda uma cópia;
// sem conexão, usa a última cópia guardada. Só guarda arquivos do próprio site (nunca dados do banco).
const CACHE = "lumos-v89";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k.startsWith("lumos-")) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;   // banco, IA e APIs: nunca
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const resp = await fetch(req);
      if (resp && resp.ok && resp.type === "basic") cache.put(req, resp.clone());
      return resp;
    } catch (_) {
      // Sem internet: a mesma página (ignorando ?v=) ou a página inicial do painel
      const guardado = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
      if (guardado) return guardado;
      if (req.mode === "navigate") return (await cache.match("dashboard.html", { ignoreSearch: true })) || Response.error();
      return Response.error();
    }
  })());
});
