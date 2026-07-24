import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { criarClienteServico } from "@/lib/supabase/server";
import { FormularioIntake } from "@/components/intake/FormularioIntake";
import { idiomaDe } from "@/lib/dominio/intake";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Conta-nos sobre o teu negócio · Nº 5",
  robots: { index: false, follow: false },
};

export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const supabase = criarClienteServico();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("nome_marca, setor, website, redes, intake_submetido_em")
    .eq("intake_token", token)
    .maybeSingle();

  if (!cliente) notFound();

  // Idioma à parte, tolerante (não parte se a migração 0021 ainda não correu).
  const { data: idiomaRow } = await supabase
    .from("clientes")
    .select("idioma")
    .eq("intake_token", token)
    .maybeSingle();

  return (
    <FormularioIntake
      token={token}
      nome={cliente.nome_marca}
      setor={cliente.setor}
      websiteInicial={cliente.website ?? ""}
      redesIniciais={(cliente.redes ?? {}) as Record<string, string>}
      jaSubmetido={!!cliente.intake_submetido_em}
      idioma={idiomaDe(idiomaRow?.idioma)}
    />
  );
}
