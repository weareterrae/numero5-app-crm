import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Contexto de segurança da «Sede» (portal do cliente autenticado).
 *
 * REGRA DE OURO: a organização e o cliente são SEMPRE resolvidos a partir da
 * SESSÃO — nunca de um parâmetro do URL. Todas as páginas e server actions da
 * Sede começam por chamar `contextoSede()`. As leituras/escritas de dados
 * internos (relatórios, planos, ficha) devem depois ser filtradas estritamente
 * por `clienteId` devolvido aqui.
 */
export type ContextoSede = {
  userId: string;
  isStaff: boolean;
  org: { id: string; nome: string; slug: string };
  marca: { nome: string; cor?: string; logo?: string };
  clienteId: string | null; // ponte orgs.cliente_id (pode ser null se ainda não ligado)
};

export async function contextoSede(opts?: { orgSlug?: string }): Promise<ContextoSede> {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?proximo=/sede");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("externo")
    .eq("id", user.id)
    .maybeSingle();
  const isStaff = perfil?.externo === false;

  // Cliente externo → a org vem SEMPRE da sua adesão (org_membros); o URL é ignorado.
  // Staff → pré-visualiza a org escolhida (cookie `sede_org`, definido em /sede/ver/[slug]).
  let orgId: string | null = null;
  if (isStaff) {
    const jar = await cookies();
    const slug = opts?.orgSlug || jar.get("sede_org")?.value;
    if (slug) {
      const { data } = await supabase.from("orgs").select("id").eq("slug", slug).maybeSingle();
      orgId = data?.id ?? null;
    }
    // staff sem cliente escolhido → escolher no operador
    if (!orgId) redirect("/leads");
  } else {
    const { data: mem } = await supabase
      .from("org_membros")
      .select("org_id")
      .eq("profile_id", user.id)
      .limit(1)
      .maybeSingle();
    orgId = mem?.org_id ?? null;
    if (!orgId) redirect("/login?proximo=/sede");
  }

  const { data: org } = await supabase
    .from("orgs")
    .select("id, nome, slug, marca")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) redirect("/login?proximo=/sede");

  // cliente_id (0051) — leitura tolerante: se a migração ainda não correu, fica null.
  let clienteId: string | null = null;
  const { data: ligacao } = await supabase
    .from("orgs")
    .select("cliente_id")
    .eq("id", orgId)
    .maybeSingle();
  clienteId = (ligacao as { cliente_id?: string | null } | null)?.cliente_id ?? null;

  const marca = org.marca as { cor?: string; logo_url?: string } | null;
  return {
    userId: user.id,
    isStaff,
    org: { id: org.id, nome: org.nome, slug: org.slug },
    marca: { nome: org.nome, cor: marca?.cor, logo: marca?.logo_url },
    clienteId,
  };
}
