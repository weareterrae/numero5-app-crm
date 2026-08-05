import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServico } from "@/lib/supabase/server";
import { GuiaForm } from "./GuiaForm";
import type { Anexo } from "./acoes";

export const dynamic = "force-dynamic";

export default async function SedeGuia() {
  const ctx = await contextoSede();

  if (!ctx.clienteId) {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-2xl font-extrabold">O Guia da tua Marca</h1>
        <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Estamos a preparar o teu espaço. Muito em breve podes preencher o guia por aqui. 🖐️
        </p>
      </div>
    );
  }

  const svc = criarClienteServico();
  // leitura tolerante (guia_marca — migração 0063)
  let guia: Record<string, string> = {};
  let marca = { nome: ctx.marca.nome, setor: "", website: "" };
  try {
    const { data: cli } = await svc
      .from("clientes")
      .select("nome_marca, setor, website, guia_marca")
      .eq("id", ctx.clienteId)
      .maybeSingle();
    if (cli?.guia_marca && typeof cli.guia_marca === "object" && !Array.isArray(cli.guia_marca)) {
      guia = cli.guia_marca as Record<string, string>;
    }
    marca = {
      nome: (cli?.nome_marca as string) || ctx.marca.nome,
      setor: (cli?.setor as string) || "",
      website: (cli?.website as string) || "",
    };
  } catch {
    // coluna ainda não existe → guia vazio, form funciona na mesma
  }

  let anexos: Anexo[] = [];
  try {
    const { data } = await svc
      .from("materiais_cliente")
      .select("id, nome, tipo, tamanho")
      .eq("cliente_id", ctx.clienteId)
      .order("criado_em", { ascending: false })
      .limit(60);
    anexos = (data as Anexo[]) ?? [];
  } catch {
    // sem tabela → sem anexos
  }

  return <GuiaForm inicial={guia} marca={marca} cor={ctx.marca.cor} anexosIniciais={anexos} />;
}
