import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { deslocarMes, mesISO, mesLegivel } from "@/lib/dominio/producao";
import { CANAIS, canaisAtivos, normalizarEscopo } from "@/lib/dominio/orcamento";
import { OBJETIVOS } from "@/lib/dominio/diagnostico/recomendacoes";
import { CopiarPeca } from "@/components/conteudo/CopiarPeca";
import { criarPlano } from "@/app/(app)/clientes/[id]/planos/acoes";

export const dynamic = "force-dynamic";

const NOME_CANAL = new Map<string, string>(CANAIS.map(([k, v]) => [k, v]));

/** Junta tudo o que o Claude Code precisa para produzir o mês deste cliente. */
function montarBrief(d: {
  marca: string;
  setor: string | null;
  notas: string | null;
  objetivos: string[];
  objetivoLivre: string | null;
  mes: string;
  producao: { posts: number; carrosseis: number; reels: number; stories: number } | null;
  canais: string[];
  moderacao: boolean;
  verbaAnuncios: number;
}): string {
  const L: string[] = [];
  L.push(`BRIEF DE PRODUÇÃO — ${d.marca}`);
  L.push(`Mês: ${mesLegivel(d.mes)}`);
  L.push("");
  L.push("MARCA");
  if (d.setor) L.push(`- Setor: ${d.setor}`);
  L.push(`- Voz / notas: ${d.notas?.trim() || "[a definir — descreve o tom desta marca]"}`);
  L.push("");
  L.push("OBJETIVOS");
  if (d.objetivos.length) d.objetivos.forEach((o) => L.push(`- ${o}`));
  if (d.objetivoLivre) L.push(`- ${d.objetivoLivre}`);
  if (!d.objetivos.length && !d.objetivoLivre) L.push("- [sem diagnóstico com objetivos]");
  L.push("");
  L.push("CONTRATADO (produzir este volume no mês)");
  if (d.producao) {
    const p = d.producao;
    const partes = [
      p.posts && `${p.posts} posts`,
      p.carrosseis && `${p.carrosseis} carrosséis`,
      p.reels && `${p.reels} reels`,
      p.stories && `${p.stories} histórias`,
    ].filter(Boolean);
    L.push(`- ${partes.length ? partes.join(" + ") : "sem produção definida no âmbito"}`);
    L.push(`- Canais: ${d.canais.length ? d.canais.join(", ") : "a combinar"}`);
    if (d.moderacao) L.push("- Moderação de comentários/DMs: sim (com aprovação humana)");
    if (d.verbaAnuncios > 0) L.push(`- Verba de anúncios do cliente: ${d.verbaAnuncios}€/mês`);
  } else {
    L.push("- [sem proposta aceite — volume a combinar com o Sandro]");
  }
  L.push("");
  L.push("O QUE FAZER (Claude Code)");
  L.push(
    "Escreve e produz o mês na voz desta marca — PT-PT, sem inventar dados, com variedade.",
  );
  L.push(
    "Faz as peças a sério (imagens/carrosséis/reels com o pipeline e o símbolo oficial), monta o plano na app para o cliente aprovar, e agenda no Metricool.",
  );
  return L.join("\n");
}

export default async function BriefPage({
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

  const [diagRes, propRes, planosRes] = await Promise.all([
    supabase
      .from("diagnosticos")
      .select("objetivos")
      .eq("cliente_id", id)
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("propostas")
      .select("escopo")
      .eq("cliente_id", id)
      .eq("estado", "aceite")
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("planos")
      .select("id, titulo, estado")
      .eq("cliente_id", id)
      .eq("mes", mes)
      .order("created_at", { ascending: false }),
  ]);
  const planos = (planosRes.data ?? []) as {
    id: string;
    titulo: string | null;
    estado: string;
  }[];

  const objetivos: string[] = (diagRes.data?.objetivos?.selecionados ?? []).map(
    (o: string) => OBJETIVOS.find(([k]) => k === o)?.[1] ?? o,
  );
  const objetivoLivre: string | null = diagRes.data?.objetivos?.texto_livre?.trim() || null;

  const escopo = propRes.data?.escopo ? normalizarEscopo(propRes.data.escopo) : null;
  const canais = escopo
    ? canaisAtivos(escopo).map(([chave, c]) => {
        const nome = NOME_CANAL.get(chave) ?? chave;
        return c.proprio ? `${nome} (próprio)` : `${nome} (adaptado)`;
      })
    : [];

  const brief = montarBrief({
    marca: cliente.nome_marca,
    setor: cliente.setor,
    notas: cliente.notas_gerais,
    objetivos,
    objetivoLivre,
    mes,
    producao: escopo?.producao ?? null,
    canais,
    moderacao: !!escopo?.extras?.moderacao,
    verbaAnuncios: escopo?.verba_anuncios ?? 0,
  });

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/clientes/${id}`} className="text-xs font-bold text-gold-dark">
            ← {cliente.nome_marca}
          </Link>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Brief de conteúdo</h1>
          <p className="text-sm text-grey">{mesLegivel(mes)}</p>
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

      {/* Como funciona */}
      <section className="rounded-xl border-2 border-cobalt/25 bg-cobalt/[0.03] p-5">
        <p className="rotulo !text-cobalt">o cérebro alimenta o motor</p>
        <h2 className="font-display text-lg font-extrabold">A app prepara, o Claude Code produz</h2>
        <p className="mt-1 text-sm text-grey">
          O conteúdo a sério — texto forte + imagens, carrosséis e reels + agendamento no Metricool —
          faz-se no Claude Code, onde estão as ligações e o pipeline visual. Esta página junta tudo o
          que ele precisa saber deste cliente. Copia o brief, cola-o no Claude Code, e o mês sai de lá
          pronto — depois volta à app como plano para o cliente aprovar.
        </p>
      </section>

      {/* O brief */}
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold">O brief deste mês</h2>
          <CopiarPeca texto={brief} />
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-cream p-4 font-mono text-xs leading-relaxed text-ink">
          {brief}
        </pre>
        {!cliente.notas_gerais?.trim() && (
          <p className="mt-3 rounded-lg bg-gold/10 px-3 py-2 text-xs text-gold-dark">
            💡 Preenche as <b>Notas</b> do cliente com o tom de voz da marca — é o que dá alma ao
            conteúdo. Está na ficha, em Dados.
          </p>
        )}
      </section>

      {/* O resultado volta aqui — o plano do mês */}
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold">Plano deste mês</h2>
          <form action={criarPlano}>
            <input type="hidden" name="cliente_id" value={id} />
            <input type="hidden" name="mes" value={mes} />
            <button className="rounded-full bg-gold px-4 py-1.5 text-sm font-bold text-ink">
              + Colar plano produzido
            </button>
          </form>
        </div>
        <p className="text-sm text-grey">
          Depois de produzir o mês no Claude Code, colas aqui o HTML com tudo, partilhas por
          WhatsApp/email, e o cliente aprova ou pede alterações. Fica tudo registado.
        </p>

        {planos.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-lg border border-line">
            {planos.map((pl) => (
              <Link
                key={pl.id}
                href={`/clientes/${id}/planos/${pl.id}`}
                className="flex items-center justify-between gap-3 border-b border-line/60 px-3 py-2.5 text-sm last:border-0 hover:bg-cream"
              >
                <span className="font-bold">{pl.titulo || `Plano de ${mesLegivel(mes)}`}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    pl.estado === "aprovado"
                      ? "bg-good/15 text-good"
                      : pl.estado === "recusado"
                        ? "bg-bad/10 text-bad"
                        : pl.estado === "alteracoes"
                          ? "bg-gold/20 text-gold-dark"
                          : "bg-line/70 text-grey"
                  }`}
                >
                  {pl.estado}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
