import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServidor } from "@/lib/supabase/server";
import { campanhasMeta, metaAdsConfigurado } from "@/lib/ads/meta";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("pt-PT");
const dinheiro = (v: number, moeda: string) =>
  `${v.toLocaleString("pt-PT", { maximumFractionDigits: 2 })} ${moeda === "EUR" ? "€" : moeda}`;

const ESTADO_ROTULO: Record<string, [string, string]> = {
  ACTIVE: ["a correr", "bg-good/15 text-good"],
  PAUSED: ["em pausa", "bg-cream text-grey"],
  CAMPAIGN_PAUSED: ["em pausa", "bg-cream text-grey"],
  IN_PROCESS: ["a preparar", "bg-warn/15 text-warn"],
  WITH_ISSUES: ["a precisar de atenção", "bg-warn/15 text-warn"],
};

const OBJETIVO_ROTULO: Record<string, string> = {
  OUTCOME_LEADS: "gerar contactos",
  OUTCOME_TRAFFIC: "levar ao site",
  OUTCOME_AWARENESS: "dar a conhecer",
  OUTCOME_ENGAGEMENT: "criar conversa",
  OUTCOME_SALES: "vender",
  OUTCOME_APP_PROMOTION: "promover app",
};

export default async function SedeAnuncios() {
  const ctx = await contextoSede();
  const supabase = await criarClienteServidor();

  // ID da conta desta marca (0061) — leitura tolerante.
  let contaId: string | null = null;
  {
    const { data } = await supabase
      .from("orgs")
      .select("meta_ads_id")
      .eq("id", ctx.org.id)
      .maybeSingle()
      .then((r) => r, () => ({ data: null }));
    contaId = (data as { meta_ads_id?: string | null } | null)?.meta_ads_id ?? null;
  }

  const vazio = (
    <div>
      <div className="rotulo">os teus anúncios</div>
      <h1 className="mt-1 font-display text-2xl font-extrabold">Anúncios</h1>
      <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
        Ainda não há campanhas de anúncios ligadas à tua marca. Quando houver, vês aqui cada
        campanha e o que ela está a render — alcance, cliques, contactos e investimento. 🖐️
      </p>
    </div>
  );

  if (!contaId || !metaAdsConfigurado()) return vazio;

  const r = await campanhasMeta(contaId);
  if (!r.ok) {
    return (
      <div>
        <div className="rotulo">os teus anúncios</div>
        <h1 className="mt-1 font-display text-2xl font-extrabold">Anúncios</h1>
        <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Não conseguimos ler as campanhas neste momento — tenta daqui a pouco. Se persistir, a
          equipa já foi avisada. 🖐️
        </p>
      </div>
    );
  }

  const ativas = r.campanhas.filter((c) => c.estado === "ACTIVE");
  const outras = r.campanhas.filter((c) => c.estado !== "ACTIVE" && (c.investimento > 0 || c.impressoes > 0));
  const totInvest = r.campanhas.reduce((s, c) => s + c.investimento, 0);
  const totLeads = r.campanhas.reduce((s, c) => s + c.leads, 0);
  const totAlcance = r.campanhas.reduce((s, c) => s + c.alcance, 0);

  if (r.campanhas.length === 0) return vazio;

  const Cartao = ({ c }: { c: (typeof r.campanhas)[number] }) => {
    const [rot, cls] = ESTADO_ROTULO[c.estado] ?? [c.estado.toLowerCase(), "bg-cream text-grey"];
    return (
      <div className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold">{c.nome}</p>
            <p className="text-xs text-grey">
              {OBJETIVO_ROTULO[c.objetivo ?? ""] ?? "campanha"} · últimos 30 dias
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>{rot}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="numero text-xl">{fmt(c.alcance)}</p>
            <p className="text-[11px] text-grey">pessoas alcançadas</p>
          </div>
          <div>
            <p className="numero text-xl">{fmt(c.cliques)}</p>
            <p className="text-[11px] text-grey">cliques</p>
          </div>
          <div>
            <p className="numero text-xl">{c.leads > 0 ? fmt(c.leads) : "—"}</p>
            <p className="text-[11px] text-grey">contactos</p>
          </div>
          <div>
            <p className="numero text-xl">{dinheiro(c.investimento, c.moeda)}</p>
            <p className="text-[11px] text-grey">
              investimento{c.custo_por_lead ? ` · ${dinheiro(c.custo_por_lead, c.moeda)}/contacto` : ""}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl">
      <div className="rotulo">os teus anúncios</div>
      <h1 className="mt-1 font-display text-2xl font-extrabold">O que os anúncios estão a render</h1>
      <p className="mt-1 text-sm text-grey">
        Números reais das tuas campanhas, dos últimos 30 dias. A verba é tua e está sempre à vista. 🖐️
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-ink p-4 text-cream">
          <p className="numero text-2xl" style={{ color: "var(--color-gold)" }}>{fmt(totAlcance)}</p>
          <p className="text-[11px] text-cream/70">pessoas alcançadas</p>
        </div>
        <div className="rounded-xl bg-ink p-4 text-cream">
          <p className="numero text-2xl" style={{ color: "var(--color-gold)" }}>{totLeads > 0 ? fmt(totLeads) : "—"}</p>
          <p className="text-[11px] text-cream/70">contactos gerados</p>
        </div>
        <div className="rounded-xl bg-ink p-4 text-cream">
          <p className="numero text-2xl" style={{ color: "var(--color-gold)" }}>{dinheiro(totInvest, r.moeda)}</p>
          <p className="text-[11px] text-cream/70">investimento (30 d)</p>
        </div>
      </div>

      {ativas.length > 0 ? (
        <section className="mt-6">
          <div className="rotulo mb-2">a correr agora ({ativas.length})</div>
          <div className="space-y-3">{ativas.map((c) => <Cartao key={c.id} c={c} />)}</div>
        </section>
      ) : (
        <p className="mt-6 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Não há campanhas a correr neste momento.
        </p>
      )}

      {outras.length > 0 ? (
        <section className="mt-6">
          <div className="rotulo mb-2">anteriores</div>
          <div className="space-y-3">{outras.map((c) => <Cartao key={c.id} c={c} />)}</div>
        </section>
      ) : null}

      <p className="mt-6 text-[11px] text-soft">
        Fonte: Meta Ads (Instagram + Facebook), últimos 30 dias. Google, TikTok e outras redes
        aparecem aqui quando houver campanhas nelas.
      </p>
    </div>
  );
}
