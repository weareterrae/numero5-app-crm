import type { Metadata } from "next";
import { FormularioComecar } from "@/components/intake/FormularioComecar";

export const metadata: Metadata = {
  title: "Diagnóstico gratuito · Nº 5",
  description:
    "Conta-nos o essencial da tua marca e voltamos com ideias concretas para o teu marketing — sem compromisso.",
};

export default function DiagnosticoPublico() {
  return <FormularioComecar />;
}
