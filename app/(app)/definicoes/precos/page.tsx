import { criarClienteServidor } from "@/lib/supabase/server";
import { criarServico } from "@/app/(app)/propostas/acoes";
import { EditorServico, type Servico } from "@/components/precos/EditorServico";

export const dynamic = "force-dynamic";

export default async function PrecosPage() {
  const supabase = await criarClienteServidor();
  // "*" para não partir se alguma coluna nova (0022) ainda não existir.
  const { data } = await supabase
    .from("precos_unitarios")
    .select("*")
    .neq("estado", "inativo")
    .order("categoria", { ascending: true })
    .order("ordem", { ascending: true });

  const servicos = (data ?? []) as Servico[];
  const mensais = servicos.filter((s) => s.tipo === "mensal");
  const setup = servicos.filter((s) => s.tipo !== "mensal");
  const aDefinir = servicos.filter((s) => s.estado === "a_definir" || s.preco === null).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="rotulo">o teu catálogo de serviços</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Preços</h1>
        <p className="mt-1 text-sm text-grey">
          É daqui que sai o valor de cada proposta. Cada serviço tem âmbito, custo interno e margem —
          uma ferramenta interna. Os preços unitários nunca aparecem na proposta do cliente.
        </p>
      </div>

      {servicos.length === 0 ? (
        <div className="rounded-xl border-2 border-warn bg-warn/10 p-5 text-sm">
          <b>A tabela ainda não existe.</b> Corre as migrações do catálogo no SQL Editor do Supabase.
        </div>
      ) : (
        <>
          {aDefinir > 0 && (
            <div className="rounded-xl border-2 border-warn bg-warn/10 p-4 text-sm">
              <b>
                {aDefinir} {aDefinir === 1 ? "serviço" : "serviços"} por definir.
              </b>{" "}
              Enquanto não tiverem preço, não podem entrar numa proposta. Abre cada um e define o
              valor.
            </div>
          )}

          <Grupo titulo="Todos os meses" nota="O que entra na avença." servicos={mensais} />
          <Grupo titulo="Arranque e extras" nota="Setup, extras e custos externos." servicos={setup} />

          {/* Novo serviço */}
          <section className="rounded-xl border-2 border-gold/40 bg-gold/5 p-5">
            <h2 className="font-display text-lg font-extrabold">+ Novo serviço</h2>
            <p className="mb-3 text-xs text-soft">
              Acrescenta o que quiseres. Depois abre-o para definir âmbito, custo e descrições.
            </p>
            <form action={criarServico} className="grid gap-2 sm:grid-cols-2">
              <input name="rotulo" required placeholder="Nome do serviço" className="rounded-lg border border-line px-3 py-2 text-sm sm:col-span-2" />
              <select name="tipo" className="rounded-lg border border-line bg-white px-3 py-2 text-sm">
                <option value="mensal">Mensal (entra na avença)</option>
                <option value="setup">Arranque / extra</option>
              </select>
              <select name="unidade" className="rounded-lg border border-line bg-white px-3 py-2 text-sm">
                <option value="unidade">Por unidade</option>
                <option value="fixo">Valor fixo</option>
                <option value="pagina">Por página</option>
                <option value="canal">Por canal</option>
                <option value="projeto">Por projeto</option>
                <option value="hora">Por hora</option>
              </select>
              <input name="categoria" placeholder="Categoria" className="rounded-lg border border-line px-3 py-2 text-sm" />
              <input name="preco" type="number" step="0.01" min="0" placeholder="Preço (€) — podes deixar vazio" className="rounded-lg border border-line px-3 py-2 text-sm tabular-nums" />
              <button className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-cream sm:col-span-2">
                Adicionar ao catálogo
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}

function Grupo({ titulo, nota, servicos }: { titulo: string; nota: string; servicos: Servico[] }) {
  if (servicos.length === 0) return null;
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="font-display text-lg font-extrabold">{titulo}</h2>
      <p className="mb-2 text-xs text-soft">{nota}</p>
      {servicos.map((s) => (
        <EditorServico key={s.chave} s={s} />
      ))}
    </section>
  );
}
