import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { OBJETIVOS } from "@/lib/dominio/diagnostico/recomendacoes";
import { confiancaPorDefeito, rotuloConfianca, corConfianca } from "@/lib/dominio/confianca";
import { guardarKpis } from "./acoes";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold";
const lab = "mb-1 block text-[11px] font-bold text-grey";

type Kpi = {
  objetivo?: string | null;
  kpi?: string | null;
  valor_inicial?: string | null;
  meta?: string | null;
  fonte?: string | null;
  resultado?: string | null;
  comentario?: string | null;
};

export default async function ObjetivosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome_marca")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  const [{ data: jsonRow }, diagRes] = await Promise.all([
    supabase.from("clientes").select("kpis").eq("id", id).maybeSingle().then(
      (r) => r,
      () => ({ data: null }),
    ),
    supabase
      .from("diagnosticos")
      .select("objetivos")
      .eq("cliente_id", id)
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const kpis = (jsonRow?.kpis ?? []) as Kpi[];
  // Sugestão dos objetivos a partir do diagnóstico (só quando ainda não há KPIs).
  const objDiag = ((diagRes.data?.objetivos?.selecionados as string[]) ?? [])
    .map((k) => OBJETIVOS.find((o) => o[0] === k)?.[1])
    .filter(Boolean) as string[];

  // Três blocos, pré-preenchidos por KPIs existentes ou pela sugestão.
  const blocos = [0, 1, 2].map((i) => ({
    ...(kpis[i] ?? {}),
    objetivo: kpis[i]?.objetivo ?? objDiag[i] ?? "",
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href={`/clientes/${cliente.id}`} className="text-xs font-bold text-gold-dark">
          ← {cliente.nome_marca}
        </Link>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">Objetivos & KPIs</h1>
        <p className="mt-1 text-sm text-grey">
          Até 3 objetivos do período, cada um com o seu número. Sem metas artificiais — se não há
          histórico, deixa a meta em branco.
        </p>
      </div>

      <form action={guardarKpis} className="space-y-4">
        <input type="hidden" name="cliente_id" value={cliente.id} />
        {blocos.map((b, i) => {
          const nivel = b.kpi ? confiancaPorDefeito(b.kpi) : null;
          const cor = nivel ? corConfianca(nivel) : "grey";
          const clsSelo =
            cor === "good" ? "bg-good/15 text-good" : cor === "warn" ? "bg-warn/15 text-warn" : cor === "cobalt" ? "bg-cobalt/10 text-cobalt" : "bg-cream text-grey";
          return (
            <section key={i} className="rounded-xl border border-line bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="rotulo">objetivo {i + 1}</p>
                {nivel && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${clsSelo}`}>
                    {rotuloConfianca(nivel)}
                  </span>
                )}
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={lab}>Objetivo</label>
                  <input name={`objetivo_${i}`} defaultValue={b.objetivo ?? ""} placeholder="ex.: Gerar contactos" className={inp} />
                </div>
                <div>
                  <label className={lab}>KPI (o número)</label>
                  <input name={`kpi_${i}`} defaultValue={b.kpi ?? ""} placeholder="ex.: contactos do formulário" className={inp} />
                </div>
                <div>
                  <label className={lab}>Fonte</label>
                  <input name={`fonte_${i}`} defaultValue={b.fonte ?? ""} placeholder="ex.: formulário do site" className={inp} />
                </div>
                <div>
                  <label className={lab}>Valor inicial</label>
                  <input name={`valor_inicial_${i}`} defaultValue={b.valor_inicial ?? ""} className={inp} />
                </div>
                <div>
                  <label className={lab}>Meta (opcional)</label>
                  <input name={`meta_${i}`} defaultValue={b.meta ?? ""} placeholder="deixa em branco se não há histórico" className={inp} />
                </div>
                <div>
                  <label className={lab}>Resultado</label>
                  <input name={`resultado_${i}`} defaultValue={b.resultado ?? ""} className={inp} />
                </div>
                <div>
                  <label className={lab}>Comentário</label>
                  <input name={`comentario_${i}`} defaultValue={b.comentario ?? ""} className={inp} />
                </div>
              </div>
            </section>
          );
        })}
        <button className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink">
          Guardar objetivos & KPIs
        </button>
      </form>
    </div>
  );
}
