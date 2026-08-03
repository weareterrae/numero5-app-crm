import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServico } from "@/lib/supabase/server";
import { ResultadosMes, type ResultadosMesDados } from "@/components/metricas/ResultadosMes";

export const dynamic = "force-dynamic";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function diaMes(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

type Linha = {
  rede: string;
  data: string;
  seguidores: number | null;
  ganho: number | null;
  alcance: number | null;
  interacoes: number | null;
  visitas: number | null;
  publicacoes: number | null;
  periodo_ini: string | null;
  periodo_fim: string | null;
  extra: Record<string, unknown> | null;
};

const Envolvente = ({ children }: { children: React.ReactNode }) => (
  <div>
    <div className="rotulo">o nosso trabalho, em números</div>
    <h1 className="mt-1 font-display text-2xl font-extrabold">Resultados</h1>
    <div className="mt-4">{children}</div>
  </div>
);

export default async function SedeResultados() {
  const ctx = await contextoSede();
  if (!ctx.clienteId) {
    return (
      <Envolvente>
        <p className="rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Estamos a preparar os teus números. Assim que houver histórico, aparece aqui o alcance, os
          seguidores ganhos e tudo o que medimos. 🖐️
        </p>
      </Envolvente>
    );
  }

  const svc = criarClienteServico();
  const { data } = await svc
    .from("marca_metricas")
    .select("rede, data, seguidores, ganho, alcance, interacoes, visitas, publicacoes, periodo_ini, periodo_fim, extra")
    .eq("cliente_id", ctx.clienteId)
    .order("data", { ascending: false })
    .limit(30)
    .then((r) => r, () => ({ data: [] as Linha[] }));

  const linhas = (data ?? []) as Linha[];
  const ig = linhas.find((l) => l.rede === "instagram");
  const web = linhas.find((l) => l.rede === "web");

  if (!ig) {
    return (
      <Envolvente>
        <p className="rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Ainda estamos a reunir os números do último mês. Volta em breve — vais ver aqui o alcance,
          as interações e os seguidores ganhos, atualizados todos os dias. 🖐️
        </p>
      </Envolvente>
    );
  }

  const ex = (ig.extra ?? {}) as Record<string, number | number[] | string | undefined>;
  const seguidores = ig.seguidores ?? 0;
  const ganho = ig.ganho ?? 0;
  const dados: ResultadosMesDados = {
    periodo: ig.periodo_ini && ig.periodo_fim ? `${diaMes(ig.periodo_ini)} – ${diaMes(ig.periodo_fim)}` : diaMes(ig.data),
    rede: "Instagram",
    seguidores,
    ganho,
    base: seguidores - ganho > 0 ? seguidores - ganho : null,
    alcance: ig.alcance ?? 0,
    interacoes: ig.interacoes ?? 0,
    comentarios: Number(ex.comentarios ?? 0),
    partilhas: ex.partilhas != null ? Number(ex.partilhas) : null,
    publicacoes: ig.publicacoes ?? 0,
    alcanceMedio: Number(ex.alcance_medio ?? (ig.alcance ?? 0) / 30),
    serie: Array.isArray(ex.serie) ? (ex.serie as number[]) : [],
    visitas: web?.visitas ?? null,
    fonte: "Metricool",
  };

  return (
    <div className="max-w-3xl">
      <div className="rotulo">o nosso trabalho, em números</div>
      <h1 className="mt-1 font-display text-2xl font-extrabold">Resultados</h1>
      <p className="mt-1 mb-5 text-sm text-grey">
        O que a tua marca alcançou no último mês — medido, não estimado. 🖐️
      </p>
      <ResultadosMes d={dados} />
      <p className="mt-6 text-[11px] text-soft">
        Dados recolhidos do Metricool e atualizados diariamente. TikTok, YouTube e outras redes
        aparecem aqui quando a tua marca as tiver ativas.
      </p>
    </div>
  );
}
