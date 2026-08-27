import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegistrar } from "@/components/pwa-registrar";

export const metadata: Metadata = {
  title: "Nº 5 · App",
  description: "CRM, diagnóstico e propostas do Nº 5.",
  robots: { index: false, follow: false },
  // iOS não lê o manifest.ts para o ícone/ecrã cheio — precisa destas tags à parte.
  // `apple-mobile-web-app-capable` à mão: o Next só gera a tag moderna sem
  // prefixo, que o Safari só passou a aceitar no iOS 17.4 — a antiga cobre
  // versões anteriores.
  appleWebApp: {
    capable: true,
    title: "Nº 5",
    statusBarStyle: "black-translucent",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#15181D",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <PwaRegistrar />
        {children}
      </body>
    </html>
  );
}
