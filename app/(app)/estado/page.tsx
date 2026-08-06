import type { Metadata } from "next";
import { PainelEstado } from "@/components/estado/PainelEstado";

export const metadata: Metadata = { title: "Estado dos Sistemas · Nº 5" };

export default function EstadoPage() {
  return <PainelEstado />;
}
