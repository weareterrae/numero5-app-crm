import type { Metadata } from "next";
import { FormularioComecar } from "@/components/intake/FormularioComecar";
import { idiomaDe } from "@/lib/dominio/intake";

export const metadata: Metadata = {
  title: "Diagnóstico gratuito · Nº 5",
  description:
    "Conta-nos o essencial da tua marca e voltamos com ideias concretas para o teu marketing — sem compromisso.",
};

export default async function DiagnosticoPublico({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  return <FormularioComecar idioma={idiomaDe(lang)} />;
}
