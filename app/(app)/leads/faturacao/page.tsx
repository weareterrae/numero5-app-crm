import Link from "next/link";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { guardarAssinatura } from "@/app/(app)/leads/faturacao/acoes";

function eur(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(Number(v))}€`;
}

type Assinatura = {
  org_id: string;
  plano: string | null;
  setup_valor: number | null;
  setup_pago: boolean;
  avenca_valor: number | null;
  estado: string;
  dia_cobranca: number | null;
};

export default async function Faturacao() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase.from("profiles").select("externo").eq("id", user.id).maybeSingle();
  if (perfil?.externo) redirect("/leads");

  const [{ data: orgs }, { data: assinaturas }] = await Promise.all([
    supabase.from("orgs").select("id, nome, slug").eq("ativo", true).order("nome"),
    // tolerante: se a migração 0050 (org_assinaturas) ainda não correu, não parte
    supabase.from("org_assinaturas").select("*").then((r) => r, () => ({ data: [] })),
  ]);

  const lista = (orgs ?? []) as { id: string; nome: string; slug: string }[];
  const porOrg = new Map((((assinaturas ?? []) as Assinatura[]) || []).map((a) => [a.org_id, a]));

  const mrr = ((assinaturas ?? []) as Assinatura[])
    .filter((a) => a.estado === "ativa")
    .reduce((t, a) => t + (Number(a.avenca_valor) || 0), 0);
  const setupPendente = ((assinaturas ?? []) as Assinatura[])
    .filter((a) => !a.setup_pago)
    .reduce((t, a) => t + (Number(a.setup_valor) || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/leads" className="text-xs font-bold text-soft hover:text-ink">
          ← Leads
        </Link>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Faturação do CRM</h1>
        <p className="text-sm text-grey">Quanto o serviço gera, por cliente.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-white/60 p-3">
          <p className="numero text-2xl">{eur(mrr)}</p>
          <p className="text-[11px] font-bold uppercase tracking-wide text-soft">Receita mensal (MRR)</p>
        </div>
        <div className="rounded-xl border border-line bg-white/60 p-3">
          <p className="numero text-2xl">{eur(mrr * 12)}</p>
          <p className="text-[11px] font-bold uppercase tracking-wide text-soft">Anualizado</p>
        </div>
        <div className="rounded-xl border border-line bg-white/60 p-3">
          <p className="numero text-2xl">{eur(setupPendente)}</p>
          <p className="text-[11px] font-bold uppercase tracking-wide text-soft">Setup por cobrar</p>
        </div>
      </div>

      <div className="space-y-2">
        {lista.map((o) => {
          const a = porOrg.get(o.id);
          return (
            <form
              key={o.id}
              action={guardarAssinatura}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-2.5"
            >
              <input type="hidden" name="org_id" value={o.id} />
              <Link href={`/leads/${o.slug}`} className="min-w-[150px] flex-1 text-sm font-bold hover:underline">
                {o.nome}
              </Link>
              <input
                name="plano"
                defaultValue={a?.plano ?? ""}
                placeholder="Plano"
                className="w-28 rounded border border-line bg-cream px-2 py-1.5 text-sm"
              />
              <label className="flex items-center gap-1 text-[11px] text-soft">
                setup
                <input
                  name="setup_valor"
                  defaultValue={a?.setup_valor ?? ""}
                  placeholder="€"
                  className="w-16 rounded border border-line bg-cream px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex items-center gap-1 text-[11px] text-soft" title="Setup pago">
                <input type="checkbox" name="setup_pago" defaultChecked={a?.setup_pago} /> pago
              </label>
              <label className="flex items-center gap-1 text-[11px] text-soft">
                €/mês
                <input
                  name="avenca_valor"
                  defaultValue={a?.avenca_valor ?? ""}
                  placeholder="€"
                  className="w-16 rounded border border-line bg-cream px-2 py-1.5 text-sm"
                />
              </label>
              <select
                name="estado"
                defaultValue={a?.estado ?? "ativa"}
                className="rounded border border-line bg-cream px-2 py-1.5 text-sm"
              >
                <option value="ativa">Ativa</option>
                <option value="pausada">Pausada</option>
                <option value="terminada">Terminada</option>
              </select>
              <button className="rounded bg-ink px-3 py-1.5 text-xs font-bold text-cream" type="submit">
                Guardar
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
