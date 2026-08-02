import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServico } from "@/lib/supabase/server";
import { mesLegivel } from "@/lib/dominio/producao";
import { DecisaoPlanoSede } from "@/components/planos/DecisaoPlanoSede";

export const dynamic = "force-dynamic";

const DECIDIVEL = new Set(["enviado", "alteracoes"]);

export default async function SedePlano() {
  const ctx = await contextoSede();

  if (!ctx.clienteId) {
    return (
      <div>
        <h1 className="font-display text-2xl font-extrabold">O plano do mês</h1>
        <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Estamos a preparar o teu plano. Assim que estiver pronto, aparece aqui para aprovares. 🖐️
        </p>
      </div>
    );
  }

  const svc = criarClienteServico();
  const { data: plano } = await svc
    .from("planos")
    .select("id, mes, titulo, conteudo_html, estado")
    .eq("cliente_id", ctx.clienteId)
    .in("estado", ["enviado", "aprovado", "alteracoes", "recusado"])
    .order("mes", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plano) {
    return (
      <div>
        <h1 className="font-display text-2xl font-extrabold">O plano do mês</h1>
        <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Ainda não há um plano publicado. O próximo está a caminho. 🖐️
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="rotulo">plano de publicações</div>
      <h1 className="mt-1 font-display text-2xl font-extrabold">{plano.titulo || "Plano"}</h1>
      <p className="mt-1 text-sm text-grey">{mesLegivel(plano.mes, "pt")}</p>

      {plano.conteudo_html?.trim() ? (
        <div
          className="prose-plano mt-6 overflow-x-auto rounded-2xl border border-line bg-white p-6"
          dangerouslySetInnerHTML={{ __html: plano.conteudo_html }}
        />
      ) : (
        <p className="mt-6 text-center text-sm text-soft">O plano está a ser preparado.</p>
      )}

      {DECIDIVEL.has(plano.estado) || plano.estado === "aprovado" || plano.estado === "recusado" ? (
        <div className="mt-6">
          <DecisaoPlanoSede planoId={plano.id} estado={plano.estado} />
        </div>
      ) : null}
    </div>
  );
}
