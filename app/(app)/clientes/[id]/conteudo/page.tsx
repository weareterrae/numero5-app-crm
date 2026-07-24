import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { deslocarMes, mesISO, mesLegivel } from "@/lib/dominio/producao";
import { GeradorConteudo } from "@/components/conteudo/GeradorConteudo";
import { CopiarPeca } from "@/components/conteudo/CopiarPeca";
import { atualizarConteudo, alternarAprovado, apagarConteudo } from "./acoes";

export const dynamic = "force-dynamic";

const ROTULO_TIPO: Record<string, string> = {
  post: "Post",
  carrossel: "Carrossel",
  reel: "Reel",
  story: "História",
  outro: "Peça",
};

type Conteudo = {
  id: string;
  tipo: string;
  tema: string | null;
  copy: string;
  hashtags: string[];
  extra: { slides?: string[]; guiao?: string };
  estado: string;
  ordem: number;
};

/** Junta a peça inteira num texto pronto a colar. */
function textoInteiro(c: Conteudo): string {
  const partes = [c.copy];
  if (c.extra?.slides?.length)
    partes.push("\n" + c.extra.slides.map((s, i) => `${i + 1}. ${s}`).join("\n"));
  if (c.extra?.guiao) partes.push("\n🎬 " + c.extra.guiao);
  if (c.hashtags?.length) partes.push("\n" + c.hashtags.join(" "));
  return partes.join("\n");
}

export default async function ConteudoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { id } = await params;
  const { mes: mesQuery } = await searchParams;
  const mes = mesQuery ?? mesISO();

  const supabase = await criarClienteServidor();
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome_marca, setor, notas_gerais")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  const { data: conteudosRaw } = await supabase
    .from("conteudos")
    .select("id, tipo, tema, copy, hashtags, extra, estado, ordem")
    .eq("cliente_id", id)
    .eq("mes", mes)
    .order("ordem", { ascending: true });
  const conteudos = (conteudosRaw ?? []) as Conteudo[];

  const aprovadas = conteudos.filter((c) => c.estado === "aprovado").length;

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/clientes/${id}`} className="text-xs font-bold text-gold-dark">
            ← {cliente.nome_marca}
          </Link>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Conteúdo do mês</h1>
          <p className="text-sm text-grey">
            {mesLegivel(mes)}
            {conteudos.length > 0 && (
              <>
                {" "}
                · <b>{conteudos.length}</b> peças · <b className="text-good">{aprovadas}</b> aprovadas
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/clientes/${id}/conteudo?mes=${deslocarMes(mes, -1)}`}
            className="rounded-full border border-line px-3 py-1.5 text-sm font-bold text-grey"
          >
            ←
          </Link>
          <Link
            href={`/clientes/${id}/conteudo?mes=${mesISO()}`}
            className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-grey"
          >
            este mês
          </Link>
          <Link
            href={`/clientes/${id}/conteudo?mes=${deslocarMes(mes, 1)}`}
            className="rounded-full border border-line px-3 py-1.5 text-sm font-bold text-grey"
          >
            →
          </Link>
        </div>
      </div>

      {/* Gerador */}
      <GeradorConteudo clienteId={id} mes={mes} vozInicial={cliente.notas_gerais ?? ""} />

      {/* Peças guardadas */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-extrabold">
          Guardado neste mês{" "}
          <span className="font-normal text-soft">({conteudos.length})</span>
        </h2>

        {conteudos.length === 0 ? (
          <p className="rounded-xl border border-line bg-white p-5 text-sm text-soft">
            Ainda sem conteúdo guardado. Gera acima, revê, e guarda. Depois é rever, afinar e agendar
            no Metricool. 🖐️
          </p>
        ) : (
          conteudos.map((c) => (
            <details
              key={c.id}
              className="group rounded-xl border border-line bg-white p-0 open:border-gold/50"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 p-4">
                <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-bold text-gold-dark">
                  {ROTULO_TIPO[c.tipo] ?? c.tipo}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                  {c.tema || c.copy.slice(0, 60)}
                </span>
                {c.estado === "aprovado" ? (
                  <span className="rounded-full bg-good/15 px-2 py-0.5 text-[11px] font-bold text-good">
                    aprovado ✓
                  </span>
                ) : (
                  <span className="rounded-full bg-line/70 px-2 py-0.5 text-[11px] font-bold text-grey">
                    rascunho
                  </span>
                )}
                <span className="text-soft transition group-open:rotate-90">›</span>
              </summary>

              <div className="border-t border-line/60 p-4">
                <form action={atualizarConteudo} className="space-y-3">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="cliente_id" value={id} />

                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-grey">Tema</span>
                    <input
                      name="tema"
                      defaultValue={c.tema ?? ""}
                      className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-grey">Legenda</span>
                    <textarea
                      name="copy"
                      defaultValue={c.copy}
                      rows={5}
                      className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
                    />
                  </label>

                  {c.tipo === "carrossel" && (
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold text-grey">
                        Slides (um por linha)
                      </span>
                      <textarea
                        name="slides"
                        defaultValue={(c.extra?.slides ?? []).join("\n")}
                        rows={5}
                        className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
                      />
                    </label>
                  )}

                  {c.tipo === "reel" && (
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold text-grey">Guião</span>
                      <textarea
                        name="guiao"
                        defaultValue={c.extra?.guiao ?? ""}
                        rows={4}
                        className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
                      />
                    </label>
                  )}

                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-grey">Hashtags</span>
                    <input
                      name="hashtags"
                      defaultValue={(c.hashtags ?? []).join(" ")}
                      className="w-full rounded-lg border border-line px-3 py-2 font-mono text-xs text-cobalt outline-none focus:border-gold"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    <button className="rounded-full bg-gold px-4 py-1.5 text-sm font-bold text-ink">
                      Guardar alterações
                    </button>
                    <CopiarPeca texto={textoInteiro(c)} />
                    <span className="flex-1" />
                  </div>
                </form>

                <div className="mt-2 flex items-center gap-3 border-t border-line/60 pt-3">
                  <form action={alternarAprovado}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="cliente_id" value={id} />
                    <input
                      type="hidden"
                      name="estado"
                      value={c.estado === "aprovado" ? "rascunho" : "aprovado"}
                    />
                    <button
                      className={`text-xs font-bold ${
                        c.estado === "aprovado" ? "text-grey" : "text-good"
                      }`}
                    >
                      {c.estado === "aprovado" ? "voltar a rascunho" : "aprovar ✓"}
                    </button>
                  </form>
                  <form action={apagarConteudo}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="cliente_id" value={id} />
                    <button className="text-xs text-soft hover:text-bad">apagar</button>
                  </form>
                </div>
              </div>
            </details>
          ))
        )}
      </section>
    </div>
  );
}
