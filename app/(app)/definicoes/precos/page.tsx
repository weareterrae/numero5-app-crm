import { criarClienteServidor } from "@/lib/supabase/server";
import { criarServico, desativarServico, guardarPrecos } from "@/app/(app)/propostas/acoes";

export const dynamic = "force-dynamic";

type Linha = {
  chave: string;
  rotulo: string;
  descricao: string | null;
  categoria: string | null;
  tipo: "mensal" | "setup";
  unidade: string;
  preco: number | null;
  minutos: number | null;
};

const UNIDADE: Record<string, string> = {
  unidade: "por unidade",
  canal: "por canal",
  fixo: "valor fixo",
  pagina: "por página",
};

export default async function PrecosPage() {
  const supabase = await criarClienteServidor();
  // "*" para não partir se a coluna categoria (0014) ainda não existir.
  const { data } = await supabase
    .from("precos_unitarios")
    .select("*")
    .eq("ativo", true)
    .order("ordem");

  const linhas = (data ?? []) as Linha[];
  const mensais = linhas.filter((l) => l.tipo === "mensal");
  const setup = linhas.filter((l) => l.tipo === "setup");
  const porDefinir = linhas.filter((l) => l.preco === null).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="rotulo">o teu catálogo de serviços</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Preços</h1>
        <p className="mt-1 text-sm text-grey">
          É daqui que sai o valor de cada proposta. Cresce à medida do negócio — vídeo, fotografia,
          apps, o que aparecer. Os valores nunca estão escritos no código.
        </p>
      </div>

      {linhas.length === 0 ? (
        <div className="rounded-xl border-2 border-warn bg-warn/10 p-5 text-sm">
          <b>A tabela ainda não existe.</b> Corre as migrações do catálogo no SQL Editor do Supabase.
        </div>
      ) : (
        <>
          {porDefinir > 0 && (
            <div className="rounded-xl border-2 border-warn bg-warn/10 p-4 text-sm">
              <b>
                {porDefinir} {porDefinir === 1 ? "preço por definir" : "preços por definir"}.
              </b>{" "}
              Enquanto estiverem vazios, o orçamento das propostas fica incompleto.
            </div>
          )}

          <form action={guardarPrecos} className="space-y-5">
            <Grupo
              titulo="Todos os meses"
              nota="O que entra na avença. O «por unidade» multiplica-se pela quantidade em cada proposta."
              linhas={mensais}
            />
            <Grupo
              titulo="Arranque (uma vez)"
              nota="O que se cobra no início, à parte da avença."
              linhas={setup}
            />
            <button className="rounded-full bg-gold px-6 py-2.5 font-bold text-ink">
              Guardar preços
            </button>
          </form>

          {/* Novo serviço */}
          <section className="rounded-xl border-2 border-gold/40 bg-gold/5 p-5">
            <h2 className="font-display text-lg font-extrabold">+ Novo serviço</h2>
            <p className="mb-3 text-xs text-soft">
              Acrescenta o que quiseres ao catálogo. Aparece logo nas propostas, na secção «outros
              serviços» do configurador.
            </p>
            <form action={criarServico} className="grid gap-2 sm:grid-cols-2">
              <input
                name="rotulo"
                required
                placeholder="Nome do serviço (ex.: Vídeo profissional)"
                className="rounded-lg border border-line px-3 py-2 text-sm sm:col-span-2"
              />
              <input
                name="descricao"
                placeholder="Descrição (opcional)"
                className="rounded-lg border border-line px-3 py-2 text-sm sm:col-span-2"
              />
              <select name="tipo" className="rounded-lg border border-line bg-white px-3 py-2 text-sm">
                <option value="mensal">Mensal (entra na avença)</option>
                <option value="setup">Arranque (uma vez)</option>
              </select>
              <select name="unidade" className="rounded-lg border border-line bg-white px-3 py-2 text-sm">
                <option value="unidade">Por unidade</option>
                <option value="fixo">Valor fixo</option>
                <option value="pagina">Por página</option>
                <option value="canal">Por canal</option>
              </select>
              <input
                name="categoria"
                placeholder="Categoria (ex.: Vídeo, Web…)"
                className="rounded-lg border border-line px-3 py-2 text-sm"
              />
              <input
                name="preco"
                type="number"
                step="0.01"
                min="0"
                placeholder="Preço (€) — podes deixar vazio"
                className="rounded-lg border border-line px-3 py-2 text-sm tabular-nums"
              />
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

function Grupo({ titulo, nota, linhas }: { titulo: string; nota: string; linhas: Linha[] }) {
  if (linhas.length === 0) return null;
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="font-display text-lg font-extrabold">{titulo}</h2>
      <p className="mb-3 text-xs text-soft">{nota}</p>
      {linhas.map((l) => {
        const custom = l.chave.startsWith("svc_");
        return (
          <div
            key={l.chave}
            className="flex flex-wrap items-center gap-3 border-b border-line/60 py-3 last:border-0"
          >
            <div className="min-w-45 flex-1">
              <p className="text-sm font-bold">
                {l.rotulo}{" "}
                <span className="font-normal text-soft">· {UNIDADE[l.unidade] ?? l.unidade}</span>
                {l.categoria && (
                  <span className="ml-2 rounded-full bg-cobalt/10 px-2 py-0.5 text-[10px] font-bold text-cobalt">
                    {l.categoria}
                  </span>
                )}
              </p>
              {l.descricao && <p className="text-xs text-grey">{l.descricao}</p>}
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-grey">Preço (€)</label>
              <input
                name={`preco__${l.chave}`}
                type="number"
                step="0.01"
                min="0"
                defaultValue={l.preco ?? ""}
                placeholder="—"
                className={`w-28 rounded-lg border px-2.5 py-1.5 text-sm tabular-nums ${
                  l.preco === null ? "border-warn bg-warn/5" : "border-line"
                }`}
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-grey">Minutos</label>
              <input
                name={`minutos__${l.chave}`}
                type="number"
                min="0"
                defaultValue={l.minutos ?? ""}
                placeholder="opcional"
                className="w-24 rounded-lg border border-line px-2.5 py-1.5 text-sm tabular-nums"
              />
            </div>
            {custom && (
              <button
                formAction={desativarServico.bind(null, l.chave)}
                className="self-end text-xs text-bad hover:underline"
                title="Remover do catálogo"
              >
                remover
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
