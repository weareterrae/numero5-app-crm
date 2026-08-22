import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerJson, obterIA } from "@/lib/ia/provider";
import { SISTEMA_GUIA, montarDossierGuia, type ConteudoGuia } from "@/lib/ia/prompts/guia";
import { lacunas, proximoPasso, type ContextoGuia } from "@/lib/dominio/guia";
import { OBJETIVOS } from "@/lib/dominio/diagnostico/recomendacoes";
import { dataCurta } from "@/lib/dominio/metricas";
import type { Estado } from "@/lib/dominio/funil";

export async function POST(req: NextRequest) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });

  let clienteId: string;
  try {
    clienteId = (await req.json()).cliente_id;
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  if (!clienteId) return NextResponse.json({ erro: "Falta o cliente." }, { status: 400 });

  // Junta tudo o que sabemos deste cliente.
  const [cliRes, contRes, diagRes, propRes, ativRes] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", clienteId).maybeSingle(),
    supabase.from("contactos").select("nome, email, telefone").eq("cliente_id", clienteId),
    supabase
      .from("diagnosticos")
      .select("estado, site_score, site_resultado, redes_scorecard, objetivos, recomendacoes")
      .eq("cliente_id", clienteId)
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("propostas")
      .select("estado, setup_valor, avenca_valor")
      .eq("cliente_id", clienteId)
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("atividades")
      .select("tipo, descricao, data, followup_em, concluido")
      .eq("cliente_id", clienteId)
      .order("data", { ascending: false })
      .limit(8),
  ]);

  const c = cliRes.data;
  if (!c) return NextResponse.json({ erro: "Cliente não encontrado." }, { status: 404 });

  const contactos = contRes.data ?? [];
  const diag = diagRes.data;
  const prop = propRes.data;
  const ativs = ativRes.data ?? [];
  const hoje = new Date().toISOString().slice(0, 10);

  const diasSemInteracao = c.ultima_interacao_at
    ? Math.floor((Date.now() - new Date(c.ultima_interacao_at).getTime()) / 86_400_000)
    : null;

  const ctx: ContextoGuia = {
    estado: c.estado as Estado,
    temWebsite: !!c.website,
    temContacto: contactos.length > 0,
    temTelefoneOuEmail: contactos.some((x) => x.email || x.telefone),
    temSetor: !!c.setor,
    temValorEstimado: c.valor_estimado != null,
    temDiagnostico: !!diag,
    diagnosticoConcluido: diag?.estado === "concluido",
    temObjetivos: (diag?.objetivos?.selecionados ?? []).length > 0,
    temAnaliseSite: diag?.site_score != null,
    redesAvaliadas: (diag?.redes_scorecard ?? []).length,
    temProposta: !!prop,
    propostaEnviada: ["enviada", "aceite", "recusada"].includes(prop?.estado ?? ""),
    nAtividades: ativs.length,
    followupAtrasado: ativs.some((a) => a.followup_em && !a.concluido && a.followup_em <= hoje),
    diasSemInteracao,
  };

  const passo = proximoPasso(ctx);
  const falta = lacunas(ctx);

  // Parte determinística: devolvida sempre, mesmo sem IA.
  const base = { proximoPasso: passo, lacunas: falta };

  const ia = obterIA();
  if (!ia) return NextResponse.json({ ...base, guia: null, aviso: "IA não configurada." });

  const dossier = montarDossierGuia({
    cliente: c.nome_marca,
    setor: c.setor,
    estado: c.estado,
    notas: c.notas_gerais,
    proximoPasso: passo,
    lacunas: falta,
    diagnostico: diag
      ? {
          nota: diag.site_score,
          falhas: (diag.site_resultado ?? [])
            .filter((r: { estado: string }) => r.estado !== "ok")
            .map((r: { titulo?: string; detalhe: string }) => `${r.titulo ?? ""} — ${r.detalhe}`),
          redes: (diag.redes_scorecard ?? []).map((r: { nome: string; notas: (number | null)[] }) => {
            const d = (r.notas ?? []).filter((x): x is number => x !== null);
            return {
              nome: r.nome,
              nota: d.length ? Math.round((d.reduce((a, b) => a + b, 0) / (d.length * 2)) * 10) : null,
            };
          }),
          objetivos: (diag.objetivos?.selecionados ?? []).map(
            (o: string) => OBJETIVOS.find(([k]) => k === o)?.[1] ?? o,
          ),
          objetivosTexto: diag.objetivos?.texto_livre ?? "",
          recomendacoes: (diag.recomendacoes ?? []).map((r: { titulo: string }) => r.titulo),
        }
      : null,
    proposta: prop
      ? { estado: prop.estado, setup: prop.setup_valor, avenca: prop.avenca_valor }
      : null,
    historico: ativs.map((a) => `${dataCurta(a.data)} · ${a.tipo}: ${a.descricao}`),
  });

  const r = await ia.gerar({
    n5: "app-guia-cliente",
    sistema: SISTEMA_GUIA,
    utilizador: `Prepara-me para a próxima conversa com este cliente:\n\n${dossier}`,
    json: true,
    maxTokens: 3072,
    temperatura: 0.7,
  });

  if (!r.ok) return NextResponse.json({ ...base, guia: null, aviso: r.erro });

  const guia = lerJson<ConteudoGuia>(r.texto);
  return NextResponse.json({ ...base, guia: guia ?? null, aviso: guia ? null : "Resposta ilegível." });
}
