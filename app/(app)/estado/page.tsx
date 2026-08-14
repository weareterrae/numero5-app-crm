import type { Metadata } from "next";
import { PainelEstado } from "@/components/estado/PainelEstado";
import { VigiaSocial } from "@/components/estado/VigiaSocial";

export const metadata: Metadata = { title: "Estado dos Sistemas · Nº 5" };

export default function EstadoPage() {
  return (
    <>
      <PainelEstado />
      <VigiaSocial />
    </>
  );
}
