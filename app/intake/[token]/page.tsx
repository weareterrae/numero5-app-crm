import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { criarClienteServico } from "@/lib/supabase/server";
import { FormularioIntake } from "@/components/intake/FormularioIntake";

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

  return (
    <FormularioIntake
      token={token}
      nome={cliente.nome_marca}
      setor={cliente.setor}
      websiteInicial={cliente.website ?? ""}
      redesIniciais={(cliente.redes ?? {}) as Record<string, string>}
      jaSubmetido={!!cliente.intake_submetido_em}
    />
  );
}
