import Link from "next/link";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteCRM } from "@/app/(app)/leads/acoes";

export default async function NovoCliente() {
  // só staff do Nº 5
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase.from("profiles").select("externo").eq("id", user.id).maybeSingle();
  if (perfil?.externo) redirect("/leads");

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <Link href="/leads" className="text-xs font-bold text-soft hover:text-ink">
          ← Leads
        </Link>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Novo cliente</h1>
        <p className="text-sm text-grey">
          Cria o CRM de um cliente: funil, token de entrada de leads e (opcional) o login dele.
        </p>
      </div>

      <form action={criarClienteCRM} className="space-y-4 rounded-xl border border-line bg-white p-5">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-grey">
            Nome do cliente
          </label>
          <input
            name="nome"
            required
            placeholder="Ex.: Externato Santa Maria de Belém"
            className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-grey">
            Email do cliente <span className="text-soft">(opcional — cria o login dele)</span>
          </label>
          <input
            name="email"
            type="email"
            placeholder="geral@cliente.pt"
            className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-grey">
            Email de alerta <span className="text-soft">(opcional — leads a arrefecer)</span>
          </label>
          <input
            name="alerta_email"
            type="email"
            placeholder="por defeito, o email do cliente"
            className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-bold text-cream hover:brightness-110"
        >
          Criar cliente
        </button>
        <p className="text-[11px] text-soft">
          Depois de criado, vai a Definições da Meta/Make e liga o token deste cliente (encontras o token no cartão do cliente).
        </p>
      </form>
    </div>
  );
}
