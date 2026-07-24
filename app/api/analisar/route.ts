import { NextResponse, type NextRequest } from "next/server";
import { correrTodas } from "@/lib/dominio/diagnostico/verificacoes";
import { pontuarSite, vereditoSite } from "@/lib/dominio/diagnostico/pontuacao";
import { obterContexto } from "@/lib/dominio/diagnostico/analisar-site";
import { criarClienteServidor } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  // Só para quem está autenticado — a ferramenta é interna.
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });

  let corpo: { url?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const obtido = await obterContexto(corpo.url ?? "");
  if (!obtido.ok) return NextResponse.json({ erro: obtido.erro }, { status: 200 });
  const ctx = obtido.ctx;

  // Pesos configuráveis, vindos da base de dados.
  const { data: catalogo } = await supabase
    .from("verificacoes_catalogo")
    .select("codigo, titulo, peso, ativo");
  const ativos = new Set((catalogo ?? []).filter((c) => c.ativo).map((c) => c.codigo));
  const pesos = Object.fromEntries((catalogo ?? []).map((c) => [c.codigo, Number(c.peso) || 1]));
  const titulos = Object.fromEntries((catalogo ?? []).map((c) => [c.codigo, c.titulo]));

  const todos = correrTodas(ctx);
  const resultados = ativos.size > 0 ? todos.filter((r) => ativos.has(r.codigo)) : todos;
  const nota = pontuarSite(resultados, pesos);

  return NextResponse.json({
    url_analisada: ctx.urlFinal,
    ms: ctx.ms,
    nota,
    veredito: vereditoSite(nota),
    resultados: resultados.map((r) => ({ ...r, titulo: titulos[r.codigo] ?? r.codigo })),
  });
}
