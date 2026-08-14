import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

// Pesquisa global do operador: clientes (por marca) + leads (nome/email).
// Gated pela sessão; a RLS staff-only (0067) garante que só a equipa vê isto.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ clientes: [], leads: [] }, { status: 401 });

  const bruto = (new URL(req.url).searchParams.get("q") || "").trim();
  // Limpar caracteres que partem o filtro PostgREST (.or usa vírgulas/parênteses).
  const q = bruto.replace(/[%,()*]/g, "").trim();
  if (q.length < 2) return NextResponse.json({ clientes: [], leads: [] });
  const like = `%${q}%`;

  const [cRes, lRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nome_marca, estado")
      .ilike("nome_marca", like)
      .neq("estado", "perdido")
      .order("nome_marca")
      .limit(6),
    // crm_leads pode não existir se o 0046 não tiver corrido → cair para vazio.
    supabase
      .from("crm_leads")
      .select("id, nome, email, orgs(slug, nome)")
      .or(`nome.ilike.${like},email.ilike.${like}`)
      .limit(6)
      .then(
        (r) => r,
        () => ({ data: [] as unknown[] }),
      ),
  ]);

  const clientes = (cRes.data ?? []).map((c) => ({ id: c.id, nome: c.nome_marca, estado: c.estado }));
  const leads = (((lRes as { data?: unknown[] }).data ?? []) as {
    id: string;
    nome: string | null;
    email: string | null;
    orgs: unknown;
  }[])
    .map((l) => {
      const o = (Array.isArray(l.orgs) ? l.orgs[0] : l.orgs) as { slug?: string; nome?: string } | null;
      return { id: l.id, nome: l.nome || l.email || "Lead", orgSlug: o?.slug ?? "", orgNome: o?.nome ?? "" };
    })
    .filter((l) => l.orgSlug);

  return NextResponse.json({ clientes, leads });
}
