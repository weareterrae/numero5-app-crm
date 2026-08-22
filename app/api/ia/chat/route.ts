import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { obterIA } from "@/lib/ia/provider";
import { dataCurta } from "@/lib/dominio/metricas";
import { anunciosRicosMeta, metaAdsConfigurado } from "@/lib/ads/meta";

const SISTEMA = `És o QUINTO — o assistente interno do Nº 5, estúdio de marketing digital + IA para PMEs em Portugal e Angola (marca operada por Os Caetanos, Lda). Estás dentro da aplicação de negócio e falas com a EQUIPA (o Sandro ou um comercial), nunca com clientes. Ninguém de fora lê o que escreves.

COMO FALAS
- Português de Portugal, tratamento por «tu». Caloroso, direto, bem-disposto — colega de equipa, não manual.
- Respostas CURTAS: 2 a 6 frases, ou uma lista pequena. Quem te pergunta está a meio de alguma coisa.
- Se te pedirem para escrever algo (email, mensagem, resposta a uma objeção), escreve mesmo, pronto a copiar.
- Texto simples, sem markdown pesado. Podes usar listas com hífen.
- 0-1 emoji, e só quando encaixa (🖐️).

O QUE A CASA FAZ — os 5 pilares
1. Marca & estratégia — identidade, tom de voz, sistema de marca documentado.
2. Sites que trabalham — rápidos, com SEO, formulários que convertem.
3. Redes sociais completas — plano mensal: posts, carrosséis, stories e reels; gestão de Instagram, Facebook e LinkedIn.
4. Atendimento com IA — assistentes com nome próprio que respondem a comentários, menções e mensagens no tom da marca. Diferencial: o bot SUGERE a resposta e o dono APROVA num clique — ninguém fica sem resposta e nada sai sem controlo humano.
5. Tráfego & dados — campanhas Meta e Google, relatórios em linguagem de dono.

PACOTES E PREÇOS (referência honesta, nunca valor fechado)
- Fundação: projeto inicial, 1 500–2 500 €. «Pôr a casa em ordem.»
- Motor: acompanhamento mensal desde 600 € para âmbito limitado. «O marketing a acontecer todos os meses.»
- Performance: Motor + anúncios e medição, orçamentado consoante canais e verba.
O valor exato fecha-se depois de alinhar o âmbito. Nunca prometas um número fechado.

⛔ REGRAS INVIOLÁVEIS
- NUNCA inventes dados, métricas, resultados, casos ou testemunhos. Se não sabes, diz que não sabes e sugere onde ir buscar.
- NUNCA prometas resultados garantidos.
- Cada cliente tem um assistente de IA com NOME PRÓPRIO, criado à medida da marca dele. Nunca se repete entre clientes. TU (o Quinto) és o assistente do próprio Nº 5 e NUNCA és oferecido a clientes.
- Garantia de honestidade da casa: se num diagnóstico não houver pelo menos 3 oportunidades concretas de melhoria, dizemos ao cliente na hora e não avançamos. Defende isto.
- Diagnóstico primeiro, venda depois. Chegamos com um achado concreto na mão, não com um catálogo.
- Números antes de adjetivos. Mostrar, não gabar.
- Pessoas primeiro, IA como acelerador. Nunca exagerar o papel da IA.

ANÚNCIOS (quando tiveres os dados do cliente abaixo)
- A app lê ao vivo as campanhas Meta de cada marca (separador «Anúncios»). Se houver dados de anúncios do cliente em baixo, analisa o desempenho como um gestor de tráfego: o que está a resultar, o que está caro, que público responde melhor.
- Sugere otimizações concretas à EQUIPA (o que escalar, o que pausar, que criativo ou página de destino rever, que público reforçar), sempre ancorado nos números. És interno — podes falar de custo por contacto, CTR, orçamento e margem à vontade.

COMO A APP FUNCIONA (podes orientar a equipa)
- Funil: Lead → Contactado → Diagnóstico → Proposta → Cliente (ou Perdido, sempre com motivo).
- Ficha do cliente: dados, contactos, histórico de atividades com follow-ups, diagnósticos e propostas.
- Diagnóstico: 11 verificações automáticas ao site + scorecard das redes à mão + três blocos (o que tem hoje, o que pretende, onde a Nº 5 ajuda).
- Proposta: herda o diagnóstico, escolhe-se o pacote, a IA escreve o texto e gera-se um link para o cliente.
- Automatismos: proposta enviada move o cliente para Proposta; aceite passa a Cliente e cria a avença; recusada dá como Perdido.
- Botão «Preparar-me» na ficha: prepara a conversa com aquele cliente em concreto.

Se te perguntarem algo sobre um cliente e tiveres o contexto dele abaixo, usa-o. Se não tiveres, diz que precisas de abrir a ficha dele.`;

/** Lê o histórico: por cliente (partilhado) ou geral (pessoal). */
export async function GET(req: NextRequest) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });

  const clienteId = req.nextUrl.searchParams.get("cliente_id");
  let q = supabase
    .from("conversas")
    .select("papel, texto, created_at")
    .order("created_at", { ascending: true })
    .limit(100);
  q = clienteId ? q.eq("cliente_id", clienteId) : q.is("cliente_id", null).eq("utilizador_id", user.id);

  const { data } = await q;
  return NextResponse.json({ mensagens: data ?? [] });
}

/** Apaga o fio de conversa atual. */
export async function DELETE(req: NextRequest) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });

  const clienteId = req.nextUrl.searchParams.get("cliente_id");
  let q = supabase.from("conversas").delete();
  q = clienteId ? q.eq("cliente_id", clienteId) : q.is("cliente_id", null).eq("utilizador_id", user.id);
  await q;
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });

  const ia = obterIA();
  if (!ia) return NextResponse.json({ erro: "IA não configurada (falta IA_API_KEY)." });

  let corpo: { mensagem?: string; cliente_id?: string | null };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const pergunta = (corpo.mensagem ?? "").trim();
  if (!pergunta) return NextResponse.json({ erro: "Sem mensagem." }, { status: 400 });

  // O fio condutor vem da base de dados, não do browser.
  const clienteIdAtual = corpo.cliente_id ?? null;
  let hq = supabase
    .from("conversas")
    .select("papel, texto")
    .order("created_at", { ascending: false })
    .limit(14);
  hq = clienteIdAtual
    ? hq.eq("cliente_id", clienteIdAtual)
    : hq.is("cliente_id", null).eq("utilizador_id", user.id);
  const { data: anteriores } = await hq;

  const mensagens = [
    ...((anteriores ?? []).reverse() as { papel: string; texto: string }[]),
    { papel: "equipa", texto: pergunta },
  ];

  // Contexto do cliente que está a ser visto, se houver.
  let contexto = "";
  if (corpo.cliente_id) {
    const [cliRes, diagRes, propRes, ativRes] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", corpo.cliente_id).maybeSingle(),
      supabase
        .from("diagnosticos")
        .select("estado, site_score, objetivos, recomendacoes")
        .eq("cliente_id", corpo.cliente_id)
        .order("versao", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("propostas")
        .select("estado, setup_valor, avenca_valor")
        .eq("cliente_id", corpo.cliente_id)
        .order("versao", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("atividades")
        .select("tipo, descricao, data")
        .eq("cliente_id", corpo.cliente_id)
        .order("data", { ascending: false })
        .limit(5),
    ]);
    const c = cliRes.data;
    if (c) {
      const L = [`\n\n--- CLIENTE QUE A EQUIPA ESTÁ A VER ---`, `Nome: ${c.nome_marca}`];
      if (c.setor) L.push(`Setor: ${c.setor}`);
      L.push(`Estado no funil: ${c.estado}`);
      if (c.website) L.push(`Site: ${c.website}`);
      if (c.notas_gerais) L.push(`Notas: ${c.notas_gerais}`);
      if (diagRes.data) {
        L.push(
          `Diagnóstico: ${diagRes.data.estado}${diagRes.data.site_score != null ? `, site ${diagRes.data.site_score}/10` : ""}`,
        );
        const recs = (diagRes.data.recomendacoes ?? []) as { titulo: string }[];
        if (recs.length) L.push(`Recomendações: ${recs.map((r) => r.titulo).join("; ")}`);
      } else L.push("Diagnóstico: ainda não existe.");
      if (propRes.data)
        L.push(
          `Proposta: ${propRes.data.estado}` +
            (propRes.data.avenca_valor ? `, avença ${propRes.data.avenca_valor}€/mês` : ""),
        );
      const ativs = ativRes.data ?? [];
      if (ativs.length)
        L.push(
          `Histórico recente: ${ativs.map((a) => `${dataCurta(a.data)} ${a.tipo}: ${a.descricao}`).join(" | ")}`,
        );

      // Anúncios Meta da marca deste cliente (ao vivo), se houver conta ligada.
      if (metaAdsConfigurado()) {
        const { data: orgAds } = await supabase
          .from("orgs")
          .select("meta_ads_id")
          .eq("cliente_id", corpo.cliente_id)
          .not("meta_ads_id", "is", null)
          .limit(1)
          .maybeSingle()
          .then((r) => r, () => ({ data: null }));
        const contaAds = (orgAds as { meta_ads_id?: string | null } | null)?.meta_ads_id ?? null;
        if (contaAds) {
          const r = await anunciosRicosMeta(contaAds);
          if (r.ok && r.anuncios.length) {
            const linhas = r.anuncios.slice(0, 8).map((a) => {
              const cpl = a.custo_por_lead ? ` @ ${a.custo_por_lead.toFixed(2)}€/lead` : "";
              return `• [${a.ativo ? "a correr" : "parado"}] "${a.titulo || a.nome}" [${a.campanha}] público: ${a.publico} | 30d: ${a.investimento.toFixed(0)}€, ${a.alcance} alc, ${a.cliques} cliq${a.ctr != null ? ` (CTR ${(a.ctr * 100).toFixed(2)}%)` : ""}, ${a.leads} leads${cpl}`;
            });
            const aCorrer = r.anuncios.filter((a) => a.ativo).length;
            L.push(`ANÚNCIOS COM ENTREGA (Meta, 30d) — ${r.anuncios.length} no total, ${aCorrer} ainda a correr:\n${linhas.join("\n")}`);
          }
        }
      }
      contexto = L.join("\n");
    }
  }

  const conversa = mensagens
    .map((m) => `${m.papel === "quinto" ? "QUINTO" : "EQUIPA"}: ${m.texto}`)
    .join("\n\n");

  const r = await ia.gerar({
    n5: "app-chat-equipa",
    sistema: SISTEMA + contexto,
    utilizador: `${conversa}\n\nResponde à última mensagem da EQUIPA.`,
    maxTokens: 1500,
    temperatura: 0.75,
  });

  if (!r.ok) return NextResponse.json({ erro: r.erro });

  // Guarda os dois lados, para o fio não se perder.
  await supabase.from("conversas").insert([
    { cliente_id: clienteIdAtual, utilizador_id: user.id, papel: "equipa", texto: pergunta },
    { cliente_id: clienteIdAtual, utilizador_id: user.id, papel: "quinto", texto: r.texto },
  ]);

  return NextResponse.json({ resposta: r.texto });
}
