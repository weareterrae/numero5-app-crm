import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nº 5 · App",
  description: "CRM, diagnóstico e propostas do Nº 5.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
