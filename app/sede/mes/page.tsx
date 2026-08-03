import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServidor, criarClienteServico } from "@/lib/supabase/server";
import { lerResultados } from "@/lib/metricas/ler";
import MesEm60s, { type Slide } from "@/components/sede/MesEm60s";

export const dynamic = "force-dynamic";

const curtoN = (n: number) =>
  n >= 10000
    ? `${Math.round(n / 1000)} mil`
    : n >= 1000
      ? `${(n / 1000).toFixed(1).replace(".", ",")} mil`
      : n.toLocaleString("pt-PT");

function inicioDoMesISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export default async function SedeMes() {
  const ctx = await contextoSede();
  const supabase = await criarClienteServidor();
  const svc = criarClienteServico();
  const desdeMes = inicioDoMesISO();
  const cor = ctx.marca.cor || "#E8A13C";
  const nomeMes = new Date().toLocaleDateString("pt-PT", { month: "long" });

  // Leads (orgs-keyed, RLS + filtro por org)
  let leadsMes = 0;
  let respondidasMes = 0;
  {
    const { data } = await supabase
      .from("crm_leads")
      .select("created_at, primeira_resposta_at, org_id")
      .eq("org_id", ctx.org.id)
      .eq("arquivado", false);
    for (const l of data ?? []) {
      if (l.created_at && l.created_at >= desdeMes) {
        leadsMes++;
        if (l.primeira_resposta_at) respondidasMes++;
      }
    }
  }

  // ROI + vendas ganhas este mês (tolerante a 0054)
  let roiMes = 0;
  let ganhasMes = 0;
  {
    const { data } = await supabase
      .from("crm_leads")
      .select("valor_negocio, ganho_em, resultado")
      .eq("org_id", ctx.org.id)
      .eq("resultado", "ganho");
    for (const l of data ?? []) {
      const g = (l as { ganho_em?: string | null }).ganho_em;
      if (g && g >= desdeMes) {
        ganhasMes++;
        roiMes += Number((l as { valor_negocio?: number | null }).valor_negocio) || 0;
      }
    }
  }

  // Interno (clientes-keyed) — só via service-role filtrado por clienteId
  let relatorioPronto = false;
  if (ctx.clienteId) {
    const { data: rel } = await svc
      .from("relatorios")
      .select("mes")
      .eq("cliente_id", ctx.clienteId)
      .order("mes", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rel?.mes && new Date(rel.mes).getMonth() === new Date().getMonth()) relatorioPronto = true;
  }

  // Monta os cartões — só entram os que têm história para contar.
  const slides: Slide[] = [];
  slides.push({
    chave: "intro",
    rotulo: ctx.marca.nome,
    titulo: `O teu ${nomeMes}, em 60 segundos`,
    sub: "Toca para avançar 🖐️",
  });

  if (leadsMes > 0) {
    slides.push({
      chave: "leads",
      rotulo: "chegaram",
      valor: String(leadsMes),
      titulo: leadsMes === 1 ? "lead este mês" : "leads este mês",
      sub: "pessoas interessadas no teu negócio",
    });
    if (respondidasMes > 0) {
      slides.push({
        chave: "resp",
        rotulo: "com resposta",
        valor: `${Math.round((respondidasMes / leadsMes) * 100)}%`,
        titulo: "das leads já responderam",
        sub: "resposta rápida vende mais",
      });
    }
  } else {
    slides.push({
      chave: "leads0",
      rotulo: "este mês",
      titulo: "O motor está a aquecer",
      sub: "estamos a preparar o que traz as próximas leads",
    });
  }

  // Resultados sociais do mês (alcance, seguidores ganhos, post do mês)
  const social = ctx.clienteId ? await lerResultados(svc, ctx.clienteId) : null;
  if (social) {
    if (social.alcance > 0) {
      slides.push({
        chave: "alcance",
        rotulo: "alcançámos",
        valor: curtoN(social.alcance),
        titulo: "pessoas este mês",
        sub:
          social.evolucao?.alcancePct != null
            ? `${social.evolucao.alcancePct >= 0 ? "+" : ""}${social.evolucao.alcancePct}% face ao mês passado`
            : "nas tuas redes sociais",
      });
    }
    if (social.ganho > 0) {
      slides.push({
        chave: "seguidores",
        rotulo: "cresceste",
        valor: `+${social.ganho.toLocaleString("pt-PT")}`,
        titulo: social.ganho === 1 ? "novo seguidor" : "novos seguidores",
        sub: "a tua comunidade a aumentar",
      });
    }
    if (social.topPost) {
      slides.push({
        chave: "toppost",
        rotulo: "o post do mês",
        valor: curtoN(social.topPost.alcance),
        titulo: "pessoas na tua melhor publicação",
        sub: `${social.topPost.interacoes.toLocaleString("pt-PT")} interações`,
      });
    }
  }

  if (roiMes > 0) {
    slides.push({
      chave: "roi",
      rotulo: "o marketing a render",
      valor: `€${roiMes.toLocaleString("pt-PT")}`,
      titulo: "fechado a partir das tuas leads",
      sub: ganhasMes > 1 ? `${ganhasMes} negócios ganhos` : "negócio ganho",
    });
  }

  if (relatorioPronto) {
    slides.push({
      chave: "relatorio",
      rotulo: "já disponível",
      titulo: "O relatório do mês está pronto",
      sub: "os números todos, em detalhe",
      cta: { texto: "Ver o relatório →", href: "/sede/relatorio" },
    });
  }

  slides.push({
    chave: "fim",
    rotulo: ctx.marca.nome,
    titulo: "Continuamos no próximo mês 🖐️",
    sub: "obrigado por caminhares connosco",
  });

  return (
    <div>
      <div className="rotulo">recap</div>
      <h1 className="mt-1 mb-6 font-display text-2xl font-extrabold">O teu mês em 60 segundos</h1>
      <MesEm60s slides={slides} cor={cor} />
    </div>
  );
}
