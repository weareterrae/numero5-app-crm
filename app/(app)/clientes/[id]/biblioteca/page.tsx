import Link from "next/link";
import { notFound } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { dataCurta } from "@/lib/dominio/metricas";
import {
  FORMATOS_CONTEUDO,
  DESEMPENHO_CONTEUDO,
  ORIGEM_CONTEUDO,
  LICENCA_CONTEUDO,
  sugestoesReaproveitamento,
} from "@/lib/dominio/biblioteca";
import { juntarConteudo, apagarConteudo } from "./acoes";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold";
const lab = "mb-1 block text-[11px] font-bold text-grey";

const rot = (lista: [string, string][], k: string | null) => lista.find(([c]) => c === k)?.[1] ?? k;

type Item = {
  id: string;
  tema: string;
  formato: string | null;
  canal: string | null;
  data: string | null;
  desempenho: string | null;
  reutilizavel: boolean;
  origem: string | null;
  licenca: string | null;
  notas: string | null;
};

export default async function BibliotecaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await criarClienteServidor();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome_marca")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) notFound();

  const { data: itensData } = await supabase
    .from("biblioteca_conteudos")
    .select("id, tema, formato, canal, data, desempenho, reutilizavel, origem, licenca, notas")
    .eq("cliente_id", id)
    .order("data", { ascending: false, nullsFirst: false })
    .then((r) => r, () => ({ data: [] }));
  const itens = (itensData ?? []) as Item[];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href={`/clientes/${cliente.id}`} className="text-xs font-bold text-gold-dark">
          ← {cliente.nome_marca}
        </Link>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">
          Biblioteca de conteúdos
        </h1>
        <p className="mt-1 text-sm text-grey">
          Os temas e peças da marca — o que resultou, o que se pode reaproveitar, e os direitos de
          cada um.
        </p>
      </div>

      {itens.length === 0 ? (
        <section className="rounded-xl border border-line bg-white p-5">
          <p className="text-sm text-soft">Ainda sem conteúdos na biblioteca.</p>
        </section>
      ) : (
        <div className="space-y-2">
          {itens.map((c) => {
            const sug = sugestoesReaproveitamento(c.formato, c.desempenho, c.reutilizavel);
            return (
              <section key={c.id} className="rounded-xl border border-line bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b>{c.tema}</b>
                  <form action={apagarConteudo.bind(null, c.id, cliente.id)}>
                    <button className="text-[11px] text-bad">apagar</button>
                  </form>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-soft">
                  {c.formato && <span>{rot(FORMATOS_CONTEUDO, c.formato)}</span>}
                  {c.canal && <span>{c.canal}</span>}
                  {c.data && <span>{dataCurta(c.data)}</span>}
                  {c.desempenho && <span>desempenho: {rot(DESEMPENHO_CONTEUDO, c.desempenho)}</span>}
                </div>
                {(c.origem || c.licenca) && (
                  <p className="mt-1 text-[11px] text-soft">
                    {c.origem && <>origem: {rot(ORIGEM_CONTEUDO, c.origem)}</>}
                    {c.origem && c.licenca && " · "}
                    {c.licenca && <>licença: {rot(LICENCA_CONTEUDO, c.licenca)}</>}
                  </p>
                )}
                {sug.length > 0 && (
                  <p className="mt-1.5 text-xs text-gold-dark">↻ {sug.join(" · ")}</p>
                )}
                {c.notas && <p className="mt-1 text-xs text-grey">{c.notas}</p>}
              </section>
            );
          })}
        </div>
      )}

      <section className="rounded-xl border-2 border-gold/40 bg-gold/5 p-5">
        <h2 className="font-display text-lg font-extrabold">Juntar conteúdo</h2>
        <form action={juntarConteudo} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="cliente_id" value={cliente.id} />
          <div className="sm:col-span-2">
            <label className={lab}>Tema</label>
            <input name="tema" required placeholder="ex.: Bastidores da produção" className={inp} />
          </div>
          <Sel name="formato" label="Formato" opcoes={FORMATOS_CONTEUDO} />
          <div>
            <label className={lab}>Canal</label>
            <input name="canal" placeholder="Instagram, blog…" className={inp} />
          </div>
          <div>
            <label className={lab}>Data</label>
            <input name="data" type="date" className={inp} />
          </div>
          <Sel name="desempenho" label="Desempenho" opcoes={DESEMPENHO_CONTEUDO} />
          <Sel name="origem" label="Origem" opcoes={ORIGEM_CONTEUDO} />
          <Sel name="licenca" label="Licença/direitos" opcoes={LICENCA_CONTEUDO} />
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="reutilizavel" value="nao" className="size-4 accent-[#E8A13C]" />
            Não reutilizável
          </label>
          <div className="sm:col-span-2">
            <label className={lab}>Notas</label>
            <input name="notas" className={inp} />
          </div>
          <button className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink sm:col-span-2">
            Juntar à biblioteca
          </button>
        </form>
      </section>
    </div>
  );
}

function Sel({ name, label, opcoes }: { name: string; label: string; opcoes: [string, string][] }) {
  return (
    <div>
      <label className={lab}>{label}</label>
      <select name={name} className={inp} defaultValue="">
        <option value="">—</option>
        {opcoes.map(([k, r]) => (
          <option key={k} value={k}>
            {r}
          </option>
        ))}
      </select>
    </div>
  );
}
