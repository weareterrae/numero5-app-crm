import Link from "next/link";
import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServico } from "@/lib/supabase/server";
import { mesLegivel } from "@/lib/dominio/producao";
import { euros } from "@/lib/dominio/metricas";

export const dynamic = "force-dynamic";

function data(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
}

const PILL_PROP: Record<string, { txt: string; cls: string }> = {
  aceite: { txt: "aceite ✓", cls: "bg-good/15 text-good" },
  aprovada: { txt: "aceite ✓", cls: "bg-good/15 text-good" },
  recusada: { txt: "recusada", cls: "bg-bad/10 text-bad" },
  expirada: { txt: "expirada", cls: "bg-cream text-soft" },
  enviada: { txt: "à tua espera", cls: "bg-gold/20 text-gold-dark" },
};
const PILL_PLANO: Record<string, { txt: string; cls: string }> = {
  aprovado: { txt: "aprovado ✓", cls: "bg-good/15 text-good" },
  enviado: { txt: "a aprovar", cls: "bg-gold/20 text-gold-dark" },
  alteracoes: { txt: "alterações pedidas", cls: "bg-warn/15 text-warn" },
  recusado: { txt: "recusado", cls: "bg-bad/10 text-bad" },
};

function Pill({ p }: { p?: { txt: string; cls: string } }) {
  if (!p) return null;
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${p.cls}`}>{p.txt}</span>;
}

export default async function SedeDocumentos() {
  const ctx = await contextoSede();

  if (!ctx.clienteId) {
    return (
      <div>
        <h1 className="font-display text-2xl font-extrabold">Documentos</h1>
        <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Aqui vais ter tudo o que fizermos por ti, num sítio só. A preparar. 🖐️
        </p>
      </div>
    );
  }

  const svc = criarClienteServico();
  const c = ctx.clienteId;
  const [dgR, prR, plR, rlR] = await Promise.all([
    svc.from("diagnosticos")
      .select("id, site_score, partilha_token, partilha_ativa, created_at")
      .eq("cliente_id", c).eq("partilha_ativa", true)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    svc.from("propostas")
      .select("id, estado, avenca_valor, setup_valor, partilha_token, partilha_ativa, enviada_em, created_at")
      .eq("cliente_id", c).eq("partilha_ativa", true)
      .order("created_at", { ascending: false }),
    svc.from("planos")
      .select("id, mes, titulo, estado")
      .eq("cliente_id", c).in("estado", ["enviado", "aprovado", "alteracoes", "recusado"])
      .order("mes", { ascending: false }),
    svc.from("relatorios")
      .select("id, mes, titulo, estado, visto_em")
      .eq("cliente_id", c).eq("estado", "enviado")
      .order("mes", { ascending: false }),
  ]);

  const diag = dgR.data;
  const propostas = prR.data ?? [];
  const planos = plR.data ?? [];
  const relatorios = rlR.data ?? [];
  const vazio = !diag && propostas.length === 0 && planos.length === 0 && relatorios.length === 0;

  return (
    <div className="max-w-3xl">
      <div className="rotulo">a tua pasta</div>
      <h1 className="mt-1 font-display text-2xl font-extrabold">Documentos</h1>
      <p className="mt-1 text-sm text-grey">
        Tudo o que fizemos por ti, do primeiro raio-X aos relatórios — sempre à mão, sempre atualizado. 🖐️
      </p>

      {vazio ? (
        <p className="mt-6 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Ainda não há nada publicado. O teu percurso começa a aparecer aqui muito em breve. 🖐️
        </p>
      ) : null}

      {/* Percurso */}
      {(diag || propostas.length > 0) && (
        <section className="mt-8">
          <div className="rotulo mb-3">o teu percurso</div>
          <div className="space-y-3">
            {diag ? (
              <a
                href={`/r/relatorio/${diag.partilha_token}`}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-4 rounded-xl border border-line bg-white px-5 py-4 transition hover:border-gold/50"
              >
                <span className="text-2xl">🩻</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">O teu ponto de partida</p>
                  <p className="text-xs text-grey">Raio-X 360 · {data(diag.created_at)}</p>
                </div>
                {diag.site_score != null ? (
                  <span className="numero text-2xl leading-none">
                    {diag.site_score}
                    <span className="text-sm text-soft">/10</span>
                  </span>
                ) : null}
                <span className="text-sm font-bold text-gold-dark">abrir ↗</span>
              </a>
            ) : null}

            {propostas.map((p) => (
              <a
                key={p.id}
                href={`/r/proposta/${p.partilha_token}`}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-4 rounded-xl border border-line bg-white px-5 py-4 transition hover:border-gold/50"
              >
                <span className="text-2xl">📄</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-bold">
                    A nossa proposta <Pill p={PILL_PROP[p.estado]} />
                  </p>
                  <p className="text-xs text-grey">
                    {data(p.enviada_em || p.created_at)}
                    {Number(p.avenca_valor) > 0 ? ` · ${euros(p.avenca_valor)}/mês` : ""}
                    {Number(p.setup_valor) > 0 ? ` · arranque ${euros(p.setup_valor)}` : ""}
                  </p>
                </div>
                <span className="text-sm font-bold text-gold-dark">abrir ↗</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Planos */}
      {planos.length > 0 && (
        <section className="mt-8">
          <div className="rotulo mb-3">planos mensais</div>
          <ul className="space-y-2">
            {planos.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/sede/plano?p=${p.id}`}
                  className="flex items-center gap-3 rounded-xl border border-line bg-white px-5 py-3 transition hover:border-gold/50"
                >
                  <span className="text-lg">🗓️</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{p.titulo || `Plano · ${mesLegivel(p.mes, "pt")}`}</p>
                    <p className="text-xs text-grey">{mesLegivel(p.mes, "pt")}</p>
                  </div>
                  <Pill p={PILL_PLANO[p.estado]} />
                  <span className="text-sm font-bold text-gold-dark">ver →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Relatórios */}
      {relatorios.length > 0 && (
        <section className="mt-8">
          <div className="rotulo mb-3">relatórios mensais</div>
          <ul className="space-y-2">
            {relatorios.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/sede/relatorio?m=${r.id}`}
                  className="flex items-center gap-3 rounded-xl border border-line bg-white px-5 py-3 transition hover:border-gold/50"
                >
                  <span className="text-lg">📊</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{r.titulo || `Relatório · ${mesLegivel(r.mes, "pt")}`}</p>
                    <p className="text-xs text-grey">{mesLegivel(r.mes, "pt")}</p>
                  </div>
                  {!r.visto_em ? (
                    <span className="rounded-full bg-cobalt/10 px-2.5 py-0.5 text-[11px] font-bold text-cobalt">novo</span>
                  ) : null}
                  <span className="text-sm font-bold text-gold-dark">ver →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
