import { notFound } from "next/navigation";
import { criarClienteServico } from "@/lib/supabase/server";
import { GuiaForm } from "@/app/sede/guia/GuiaForm";
import type { Anexo } from "@/app/sede/guia/acoes";

export const dynamic = "force-dynamic";

export default async function GuiaToken({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const svc = criarClienteServico();

  const { data: cli } = await svc
    .from("clientes")
    .select("id, nome_marca, setor, website, guia_marca")
    .eq("guia_token", token)
    .maybeSingle();
  if (!cli) notFound();

  // cor da marca via org ligada (tolerante)
  let cor: string | undefined;
  try {
    const { data: org } = await svc.from("orgs").select("marca").eq("cliente_id", cli.id).maybeSingle();
    cor = (org?.marca as { cor?: string } | null)?.cor;
  } catch {
    /* sem cor */
  }

  const guia =
    cli.guia_marca && typeof cli.guia_marca === "object" && !Array.isArray(cli.guia_marca)
      ? (cli.guia_marca as Record<string, string>)
      : {};
  const marca = {
    nome: (cli.nome_marca as string) || "a tua marca",
    setor: (cli.setor as string) || "",
    website: (cli.website as string) || "",
  };

  let anexos: Anexo[] = [];
  try {
    const { data } = await svc
      .from("materiais_cliente")
      .select("id, nome, tipo, tamanho")
      .eq("cliente_id", cli.id)
      .order("criado_em", { ascending: false })
      .limit(60);
    anexos = (data as Anexo[]) ?? [];
  } catch {
    /* sem anexos */
  }

  return (
    <main className="min-h-screen bg-[#efece4] px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex items-center gap-3">
          <span
            className="inline-block h-8 w-8 rounded-lg"
            style={{ background: cor || "#E8A13C" }}
            aria-hidden
          />
          <span className="font-display text-lg font-extrabold">{marca.nome}</span>
        </div>
        <GuiaForm inicial={guia} marca={marca} cor={cor} anexosIniciais={anexos} token={token} />
      </div>
    </main>
  );
}
