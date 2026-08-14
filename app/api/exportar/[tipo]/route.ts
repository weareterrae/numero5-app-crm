import { criarClienteServidor } from "@/lib/supabase/server";

// Exportações CSV do operador (carteira, faturação). Gated pela sessão.
// `;` como separador + BOM UTF-8 → abre logo bem no Excel em PT (acentos incluídos).
export const dynamic = "force-dynamic";

function paraCSV(linhas: (string | number | null)[][]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return linhas.map((l) => l.map(esc).join(";")).join("\r\n");
}

function resposta(nome: string, linhas: (string | number | null)[][]) {
  return new Response("﻿" + paraCSV(linhas), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nome}.csv"`,
      "cache-control": "no-store",
    },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Não autorizado.", { status: 401 });

  const hoje = new Date().toISOString().slice(0, 10);

  if (tipo === "clientes") {
    const { data } = await supabase
      .from("clientes")
      .select("nome_marca, setor, estado, website, origem, valor_estimado, created_at")
      .order("nome_marca");
    const linhas: (string | number | null)[][] = [
      ["Marca", "Setor", "Estado", "Website", "Origem", "Valor estimado (€)", "Criado em"],
    ];
    for (const c of data ?? [])
      linhas.push([
        c.nome_marca,
        c.setor,
        c.estado,
        c.website,
        c.origem,
        c.valor_estimado,
        (c.created_at || "").slice(0, 10),
      ]);
    return resposta(`carteira-${hoje}`, linhas);
  }

  if (tipo === "faturacao") {
    const { data } = await supabase
      .from("cobrancas")
      .select("mes, tipo, descricao, valor, estado, cobrado_em, clientes(nome_marca)")
      .order("mes", { ascending: false });
    const linhas: (string | number | null)[][] = [
      ["Marca", "Mês", "Tipo", "Descrição", "Valor (€)", "Estado", "Cobrado em"],
    ];
    for (const c of data ?? []) {
      const m = (Array.isArray(c.clientes) ? c.clientes[0] : c.clientes) as { nome_marca?: string } | null;
      linhas.push([
        m?.nome_marca ?? "",
        (c.mes || "").slice(0, 7),
        c.tipo,
        c.descricao,
        c.valor,
        c.estado === "cobrado" ? "Cobrado" : "Por cobrar",
        (c.cobrado_em || "").slice(0, 10),
      ]);
    }
    return resposta(`faturacao-${hoje}`, linhas);
  }

  return new Response("Tipo desconhecido.", { status: 404 });
}
