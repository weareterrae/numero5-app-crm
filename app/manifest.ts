import type { MetadataRoute } from "next";

/**
 * Manifesto PWA — dá à app.numerocinco.pt um ícone e ecrã cheio quando
 * instalada no telemóvel ("Adicionar ao ecrã principal"). Mesma app, mesma
 * sessão, mesmos dados — só sem a barra do browser à volta.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nº 5 · App",
    short_name: "Nº 5",
    description: "CRM, diagnóstico e propostas do Nº 5.",
    start_url: "/",
    display: "standalone",
    background_color: "#15181D",
    theme_color: "#15181D",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
