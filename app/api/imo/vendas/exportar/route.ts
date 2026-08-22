/**
 * Exportação mensal das operações de venda para a IMOESTATÍSTICA.
 *
 *   GET /api/imo/vendas/exportar              o mês passado
 *   GET /api/imo/vendas/exportar?de=2026-06&ate=2026-08
 *
 * PORQUE EXISTE
 *
 * Não é uma conveniência: é a cláusula 3 da ficha de subscrição do SIR,
 * assinada a 25-06-2026. A Terrae comprometeu-se a facultar
 * MENSALMENTE à IMOESTATÍSTICA os dados das suas operações de
 * venda/arrendamento/financiamento/avaliação, «em formato informático,
 * de acordo com o modelo de prestação de informação definido pela
 * IMOESTATÍSTICA».
 *
 * A obrigação corre desde junho. Nada está em falta — a Terrae ainda não
 * fechou nenhuma venda desde a assinatura, e um mês sem operações é um
 * mês sem nada a enviar. Isto existe para que, quando a primeira fechar,
 * cumprir seja descarregar um ficheiro.
 *
 * SOBRE O FORMATO
 *
 * O contrato diz que o modelo é definido por eles e «deverá ser
 * facultado à ENTIDADE SUBSCRITORA». Não o temos. Portanto isto produz
 * CSV com as três dimensões que a cláusula 3.c) enumera —
 * localização, caracterização física e qualitativa, caracterização da
 * operação — com cabeçalhos em português claro.
 *
 * Quando o modelo deles chegar, muda-se aqui o mapeamento das colunas e
 * mais nada: os dados já estão todos guardados.
 *
 * O QUE NÃO VAI
 *
 * Nada que identifique o cliente. A cláusula 5 obriga a IMOESTATÍSTICA a
 * tratar dados pessoais que receba, e a resposta mais simples a isso é
 * não lhos mandar: uma venda descreve-se por zona, área, tipologia e
 * preço, e nenhum desses é uma pessoa.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { criarClienteServidor } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** «2026-07» → primeiro e último instante do mês. */
function mes(m: string): { de: string; ate: string } | null {
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  const [a, b] = m.split("-").map(Number);
  if (b < 1 || b > 12) return null;
  const fim = new Date(Date.UTC(a, b, 1));
  return { de: `${m}-01`, ate: fim.toISOString().slice(0, 10) };
}

/** O mês anterior ao de hoje — é esse que se envia. */
function mesPassado(hoje: Date): string {
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

/** Uma célula de CSV. Aspas duplicadas, campo entre aspas se precisar. */
function celula(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLUNAS = [
  "referencia", "data_escritura", "concelho", "freguesia_ou_zona",
  "tipo_imovel", "tipologia", "area_bruta_privativa_m2", "area_lote_m2",
  "ano_construcao", "estado_conservacao", "caracteristicas",
  "preco_inicial_eur", "preco_final_pedido_eur", "preco_escritura_eur",
  "eur_m2", "data_anuncio", "dias_mercado", "n_visitas", "n_propostas",
] as const;

export async function GET(req: NextRequest) {
  const sbAuth = await criarClienteServidor();
  const { data: sessao } = await sbAuth.auth.getUser();
  if (!sessao.user) return NextResponse.json({ erro: "sem sessão" }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const de = q.get("de") ? mes(q.get("de")!) : null;
  const ate = q.get("ate") ? mes(q.get("ate")!) : null;
  const alvo = de ?? mes(mesPassado(new Date()))!;
  const fim = ate ? ate.ate : alvo.ate;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await db
    .from("imo_transacoes")
    .select("referencia, tipo, tipologia, area, lote, ano, estado, caracteristicas, " +
            "preco_inicial, preco_final_pedido, preco_transacao, data_anuncio, " +
            "data_transacao, dias_mercado, n_visitas, n_propostas, " +
            "imo_geografias(nome, nivel, pai_id)")
    .eq("fonte_id", "terrae")
    // Só escrituras são operações. Um preço de tabela enviado como
    // venda concluída polui a base de quem o recebe — e a cláusula 3
    // fala de operações, não de referências.
    .eq("natureza", "escritura")
    .gte("data_transacao", alvo.de)
    .lt("data_transacao", fim)
    .order("data_transacao", { ascending: true });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  // O concelho não está na transação: sobe-se a hierarquia a partir da
  // geografia dela. Sem isto, uma venda numa microzona sairia sem
  // concelho, e a localização é a primeira das três dimensões que a
  // cláusula 3.c) exige.
  const { data: geo } = await db.from("imo_geografias").select("id, nome, nivel, pai_id");
  const porId = new Map((geo ?? []).map((g) => [g.id, g]));
  const concelhoDe = (g: { nivel: string; nome: string; pai_id: string | null } | null) => {
    let cur: any = g;
    while (cur && cur.nivel !== "concelho") cur = cur.pai_id ? porId.get(cur.pai_id) : null;
    return cur?.nome ?? "";
  };

  const linhas = (data ?? []).map((t: any) => {
    const g = Array.isArray(t.imo_geografias) ? t.imo_geografias[0] : t.imo_geografias;
    const area = Number(t.area) || 0;
    const preco = Number(t.preco_transacao) || 0;
    return [
      t.referencia, t.data_transacao, concelhoDe(g), g?.nome,
      t.tipo, t.tipologia, t.area, t.lote,
      t.ano, t.estado, (t.caracteristicas ?? []).join(", "),
      t.preco_inicial, t.preco_final_pedido, t.preco_transacao,
      area > 0 ? Math.round(preco / area) : "",
      t.data_anuncio, t.dias_mercado, t.n_visitas, t.n_propostas,
    ].map(celula).join(";");
  });

  // Ponto e vírgula e BOM: é o que o Excel português abre sem perguntar
  // nada. Um ficheiro que obriga o destinatário a adivinhar a codificação
  // é um ficheiro que volta com um email a pedir ajuda.
  const csv = "﻿" + [COLUNAS.join(";"), ...linhas].join("\r\n") + "\r\n";
  const periodo = ate ? `${alvo.de.slice(0, 7)}_a_${q.get("ate")}` : alvo.de.slice(0, 7);

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="terrae-operacoes-${periodo}.csv"`,
      // Quem descarrega precisa de saber se veio vazio por não haver
      // vendas ou por engano no período.
      "x-linhas": String(linhas.length),
    },
  });
}
