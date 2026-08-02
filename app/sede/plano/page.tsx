import Link from "next/link";
import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServico } from "@/lib/supabase/server";
import { mesLegivel } from "@/lib/dominio/producao";
import { DecisaoPlanoSede } from "@/components/planos/DecisaoPlanoSede";

export const dynamic = "force-dynamic";

const DECIDIVEL = new Set(["enviado", "alteracoes", "aprovado", "recusado"]);

export default async function SedePlano({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const ctx = await contextoSede();
  const { p } = await searchParams;

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

  // Lista de planos publicados DESTE cliente (sempre filtrado pela sessão).
  const { data: lista } = await svc
    .from("planos")
    .select("id, mes, estado")
    .eq("cliente_id", ctx.clienteId)
    .eq("arquivado", false) // ocultados pelo operador não entram na Sede
    .in("estado", ["enviado", "aprovado", "alteracoes", "recusado"])
    .order("mes", { ascending: false });
  const planos = lista ?? [];

  if (planos.length === 0) {
    return (
      <div>
        <h1 className="font-display text-2xl font-extrabold">O plano do mês</h1>
        <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Ainda não há um plano publicado. O próximo está a caminho. 🖐️
        </p>
      </div>
    );
  }

  // Seleciona o pedido (validando que pertence a este cliente) ou o mais recente.
  const escolhido = (p && planos.find((x) => x.id === p)) || planos[0];

  const { data: plano } = await svc
    .from("planos")
    .select("id, mes, titulo, conteudo_html, estado")
    .eq("id", escolhido.id)
    .eq("cliente_id", ctx.clienteId)
    .maybeSingle();

  if (!plano) {
    return (
      <div>
        <h1 className="font-display text-2xl font-extrabold">O plano do mês</h1>
        <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Não encontrei esse plano. Volta à tua pasta e escolhe outro. 🖐️
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="rotulo">plano de publicações</div>
          <h1 className="mt-1 font-display text-2xl font-extrabold">{plano.titulo || "Plano"}</h1>
          <p className="mt-1 text-sm text-grey">{mesLegivel(plano.mes, "pt")}</p>
        </div>
        {planos.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {planos.slice(0, 8).map((x) => {
              const ativo = x.id === escolhido.id;
              return (
                <Link
                  key={x.id}
                  href={`/sede/plano?p=${x.id}`}
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    ativo ? "bg-ink text-cream" : "border border-line text-grey hover:bg-cream"
                  }`}
                >
                  {mesLegivel(x.mes, "pt")}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      {plano.conteudo_html?.trim() ? (
        <div
          className="prose-plano mt-6 overflow-x-auto rounded-2xl border border-line bg-white p-6"
          dangerouslySetInnerHTML={{ __html: plano.conteudo_html }}
        />
      ) : (
        <p className="mt-6 text-center text-sm text-soft">O plano está a ser preparado.</p>
      )}

      {DECIDIVEL.has(plano.estado) ? (
        <div className="mt-6">
          <DecisaoPlanoSede planoId={plano.id} estado={plano.estado} />
        </div>
      ) : null}
    </div>
  );
}
