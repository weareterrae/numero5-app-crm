import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServico, criarClienteServidor } from "@/lib/supabase/server";
import { lerResultados } from "@/lib/metricas/ler";
import { ResultadosMes } from "@/components/metricas/ResultadosMes";
import { BlocoAnuncios } from "@/components/ads/BlocoAnuncios";

export const dynamic = "force-dynamic";

/** A conta Meta da org do cliente, para o bloco de anúncios. */
async function contaMeta(orgId: string) {
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("orgs")
    .select("meta_ads_id")
    .eq("id", orgId)
    .maybeSingle()
    .then((r) => r, () => ({ data: null }));
  return (data as { meta_ads_id?: string | null } | null)?.meta_ads_id ?? null;
}

const Cabecalho = () => (
  <>
    <div className="rotulo">o nosso trabalho, em números</div>
    <h1 className="mt-1 font-display text-2xl font-extrabold">Resultados</h1>
  </>
);

export default async function SedeResultados() {
  const ctx = await contextoSede();
  const contaId = await contaMeta(ctx.org.id);

  if (!ctx.clienteId) {
    return (
      <div className="max-w-3xl">
        <Cabecalho />
        <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Estamos a preparar os teus números. Assim que houver histórico, aparece aqui o alcance, os
          seguidores ganhos e tudo o que medimos. 🖐️
        </p>
        <BlocoAnuncios contaId={contaId} />
      </div>
    );
  }

  const dados = await lerResultados(criarClienteServico(), ctx.clienteId);

  return (
    <div className="max-w-3xl">
      <Cabecalho />
      <p className="mt-1 mb-5 text-sm text-grey">
        Tudo o que a tua marca alcançou no último mês, num só sítio — o que crescemos sem pagar e o
        que os anúncios trouxeram. Medido, não estimado. 🖐️
      </p>

      {dados ? (
        <>
          <div className="rotulo mb-3">o que crescemos sem pagar</div>
          <ResultadosMes d={dados} />
          <p className="mt-6 text-[11px] text-soft">
            Dados recolhidos do Metricool e atualizados diariamente. TikTok, YouTube e outras redes
            aparecem aqui quando a tua marca as tiver ativas.
          </p>
        </>
      ) : (
        <p className="rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Ainda estamos a reunir os números do último mês. Volta em breve — vais ver aqui o alcance,
          as interações e os seguidores ganhos, atualizados todos os dias. 🖐️
        </p>
      )}

      <BlocoAnuncios contaId={contaId} />
    </div>
  );
}
