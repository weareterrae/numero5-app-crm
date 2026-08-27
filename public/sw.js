// Service worker mínimo — só para o browser considerar a app instalável
// (o requisito do Android para o atalho "Instalar app"). Não faz cache de
// nada: os dados de clientes/propostas/cobranças são sempre pedidos à rede,
// nunca servidos de uma cópia antiga.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
