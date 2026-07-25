import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  CONSENTIMENTOS_PORTEFOLIO,
  podeEntrarPortefolio,
  exigeAprovacaoPortefolio,
} from "@/lib/dominio/operacao";
import { guardarPortefolio } from "./acoes";

export const dynamic = "force-dynamic";

export default async function AutorizacoesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome_marca")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  // portefolio (0038) tolerante.
  const { data: jsonRow } = await supabase
    .from("clientes")
    .select("portefolio")
    .eq("id", id)
    .maybeSingle()
    .then((r) => r, () => ({ data: null }));
  const p = (jsonRow?.portefolio ?? {}) as Record<string, boolean>;
  const pode = podeEntrarPortefolio(p);
  const previa = exigeAprovacaoPortefolio(p);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href={`/clientes/${cliente.id}`} className="text-xs font-bold text-gold-dark">
          ← {cliente.nome_marca}
        </Link>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">
          Autorizações de portefólio
        </h1>
        <p className="mt-1 text-sm text-grey">
          Nada entra no portefólio sem autorização. Marca só o que o cliente autorizou por escrito.
        </p>
      </div>

      <div
        className={`rounded-xl border-2 p-4 text-sm font-bold ${
          pode ? "border-good bg-good/10 text-good" : "border-warn bg-warn/10 text-warn"
        }`}
      >
        {pode
          ? "Este cliente pode entrar no portefólio (há autorização pública)."
          : "Sem autorização pública — não usar nome, logótipo, site nem conteúdos."}
        {pode && previa && " Precisa de aprovação prévia antes de cada publicação."}
      </div>

      <section className="rounded-xl border border-line bg-white p-5">
        <form action={guardarPortefolio} className="space-y-2.5">
          <input type="hidden" name="cliente_id" value={cliente.id} />
          {CONSENTIMENTOS_PORTEFOLIO.map(([chave, rotulo]) => (
            <label key={chave} className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" name={chave} defaultChecked={!!p[chave]} className="size-4 accent-[#E8A13C]" />
              {rotulo}
            </label>
          ))}
          <button className="mt-2 rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink">
            Guardar autorizações
          </button>
        </form>
      </section>
    </div>
  );
}
