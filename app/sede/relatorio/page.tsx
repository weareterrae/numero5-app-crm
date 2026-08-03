import Link from "next/link";
import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServico, criarClienteServidor } from "@/lib/supabase/server";
import { mesLegivel } from "@/lib/dominio/producao";
import { AnunciosDoMes } from "@/components/ads/AnunciosDoMes";
import { lerResultados } from "@/lib/metricas/ler";
import { ResultadosMes } from "@/components/metricas/ResultadosMes";

export const dynamic = "force-dynamic";

export default async function SedeRelatorio({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const ctx = await contextoSede();
  const { m } = await searchParams;

  if (!ctx.clienteId) {
    return (
      <div>
        <h1 className="font-display text-2xl font-extrabold">O trabalho do mês</h1>
        <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Estamos a preparar o teu primeiro relatório. Fica disponível aqui muito em breve. 🖐️
        </p>
      </div>
    );
  }

  const svc = criarClienteServico();

  // Lista de relatórios publicados DESTE cliente (sempre filtrado pela sessão).
  const { data: lista } = await svc
    .from("relatorios")
    .select("id, mes, titulo, estado")
    .eq("cliente_id", ctx.clienteId)
    .eq("estado", "enviado")
    .order("mes", { ascending: false });
  const relatorios = lista ?? [];

  if (relatorios.length === 0) {
    return (
      <div>
        <h1 className="font-display text-2xl font-extrabold">O trabalho do mês</h1>
        <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Ainda não há relatórios publicados. O primeiro está a caminho. 🖐️
        </p>
      </div>
    );
  }

  // Seleciona o pedido (validando que pertence a este cliente) ou o mais recente.
  const escolhido = (m && relatorios.find((r) => r.id === m)) || relatorios[0];

  const { data: rel } = await svc
    .from("relatorios")
    .select("id, mes, titulo, conteudo_html, visto_em")
    .eq("id", escolhido.id)
    .eq("cliente_id", ctx.clienteId)
    .maybeSingle();

  if (rel && !rel.visto_em) {
    await svc.from("relatorios").update({ visto_em: new Date().toISOString() }).eq("id", rel.id).eq("cliente_id", ctx.clienteId);
  }

  // Conta de anúncios da marca (0061) — para anexar os resultados do mês.
  let contaAds: string | null = null;
  {
    const supabase = await criarClienteServidor();
    const { data } = await supabase
      .from("orgs")
      .select("meta_ads_id")
      .eq("id", ctx.org.id)
      .maybeSingle()
      .then((r) => r, () => ({ data: null }));
    contaAds = (data as { meta_ads_id?: string | null } | null)?.meta_ads_id ?? null;
  }

  // Bloco «Resultados do mês» — os números reais das redes (Metricool).
  const resultados = await lerResultados(svc, ctx.clienteId);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="rotulo">o teu mês em números</div>
          <h1 className="mt-1 font-display text-2xl font-extrabold">
            {rel?.titulo || "Relatório"}
          </h1>
          <p className="mt-1 text-sm text-grey">{rel ? mesLegivel(rel.mes, "pt") : ""}</p>
        </div>
        {relatorios.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {relatorios.slice(0, 8).map((r) => {
              const ativo = r.id === escolhido.id;
              return (
                <Link
                  key={r.id}
                  href={`/sede/relatorio?m=${r.id}`}
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    ativo ? "bg-ink text-cream" : "border border-line text-grey hover:bg-cream"
                  }`}
                >
                  {mesLegivel(r.mes, "pt")}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      {rel?.conteudo_html?.trim() ? (
        <div
          className="prose-plano mt-6 overflow-x-auto rounded-2xl border border-line bg-white p-6"
          dangerouslySetInnerHTML={{ __html: rel.conteudo_html }}
        />
      ) : (
        <p className="mt-6 text-center text-sm text-soft">O relatório está a ser preparado.</p>
      )}

      {resultados ? (
        <div className="mt-6">
          <ResultadosMes d={resultados} />
        </div>
      ) : null}

      {rel ? <AnunciosDoMes contaId={contaAds} mesISO={rel.mes} /> : null}
    </div>
  );
}
