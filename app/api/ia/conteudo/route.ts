import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";
import { lerJson, obterIA } from "@/lib/ia/provider";
import {
  SISTEMA_CONTEUDO,
  montarDossierConteudo,
  type PecaGerada,
} from "@/lib/ia/prompts/conteudo";
import { OBJETIVOS } from "@/lib/dominio/diagnostico/recomendacoes";
import { mesLegivel } from "@/lib/dominio/producao";

type Pedido = {
  cliente_id?: string;
  mes?: string; // ISO 1.º do mês
  mix?: { posts?: number; carrosseis?: number; reels?: number; stories?: number };
  voz?: string;
  temas?: string;
};

const lim = (x: unknown) => Math.max(0, Math.min(20, Math.round(Number(x) || 0)));

export async function POST(req: NextRequest) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });

  const ia = obterIA();
  if (!ia)
    return NextResponse.json(
      { erro: "Falta configurar a IA (IA_API_KEY) nas variáveis do Netlify." },
      { status: 200 },
    );

  let p: Pedido;
  try {
    p = await req.json();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  if (!p?.cliente_id) return NextResponse.json({ erro: "Falta o cliente." }, { status: 400 });

  const mix = {
    posts: lim(p.mix?.posts),
    carrosseis: lim(p.mix?.carrosseis),
    reels: lim(p.mix?.reels),
    stories: lim(p.mix?.stories),
  };
  const total = mix.posts + mix.carrosseis + mix.reels + mix.stories;
  if (total === 0)
    return NextResponse.json({ erro: "Diz quantas peças de cada tipo queres." }, { status: 200 });
  if (total > 24)
    return NextResponse.json(
      { erro: "São muitas peças de uma vez. Gera até ~20 e repete para o resto." },
      { status: 200 },
    );

  // Tudo o que sabemos do cliente alimenta a voz da marca.
  const [cliRes, diagRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("nome_marca, setor, notas_gerais")
      .eq("id", p.cliente_id)
      .maybeSingle(),
    supabase
      .from("diagnosticos")
      .select("objetivos")
      .eq("cliente_id", p.cliente_id)
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const c = cliRes.data;
  if (!c) return NextResponse.json({ erro: "Cliente não encontrado." }, { status: 404 });

  const objetivos: string[] = (diagRes.data?.objetivos?.selecionados ?? []).map(
    (o: string) => OBJETIVOS.find(([k]) => k === o)?.[1] ?? o,
  );
  const objetivoLivre = diagRes.data?.objetivos?.texto_livre;

  const dossier = montarDossierConteudo({
    cliente: c.nome_marca,
    setor: c.setor,
    sobre: c.notas_gerais,
    voz: p.voz?.trim() || null,
    objetivos: objetivoLivre ? [...objetivos, objetivoLivre] : objetivos,
    mes: mesLegivel(p.mes ?? new Date().toISOString().slice(0, 10)),
    mix,
    temas: p.temas?.trim() || null,
  });

  const r = await ia.gerar({
    sistema: SISTEMA_CONTEUDO,
    utilizador: `Produz o mês de conteúdo a partir deste dossiê real:\n\n${dossier}`,
    json: true,
    // Conteúdo é longo: carrosséis e guiões ocupam muito. Espaço largo para não cortar a meio.
    maxTokens: 8192,
    temperatura: 0.9,
  });

  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 200 });

  const d = lerJson<{ pecas: PecaGerada[] }>(r.texto);
  if (!d?.pecas || !Array.isArray(d.pecas) || d.pecas.length === 0)
    return NextResponse.json(
      { erro: "A IA devolveu algo que não consegui ler. Tenta outra vez." },
      { status: 200 },
    );

  return NextResponse.json({ pecas: d.pecas });
}
