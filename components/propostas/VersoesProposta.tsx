import { euros, dataCurta } from "@/lib/dominio/metricas";
import { diferencasVersao, type SnapshotVersao } from "@/lib/dominio/operacao";
import { congelarVersaoForm } from "@/app/(app)/propostas/acoes";

export type Versao = {
  id: string;
  versao: number;
  avenca_valor: number | null;
  setup_valor: number | null;
  ambito: string[] | null;
  motivo: string | null;
  criado_em: string;
  aceite: boolean;
};

const inp = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold";

export function VersoesProposta({
  propostaId,
  versoes,
}: {
  propostaId: string;
  versoes: Versao[];
}) {
  // Ordenar ascendente para calcular diferenças versão-a-versão.
  const asc = [...versoes].sort((a, b) => a.versao - b.versao);

  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="font-display text-lg font-extrabold">Versões</h2>
      <p className="mb-3 text-xs text-soft">
        Cada versão é uma fotografia imutável: preços, âmbito e condições do momento. Alterar o
        catálogo depois nunca muda uma proposta já enviada.
      </p>

      {asc.length === 0 ? (
        <p className="mb-4 text-sm text-soft">
          Ainda não há versões congeladas. Ao partilhares o link, é criada a v1 automaticamente.
        </p>
      ) : (
        <div className="mb-4 space-y-2">
          {[...asc].reverse().map((v) => {
            const anterior = asc.find((x) => x.versao === v.versao - 1) ?? null;
            const d = diferencasVersao(anterior as SnapshotVersao | null, v as SnapshotVersao);
            return (
              <div key={v.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b>
                    v{v.versao}
                    {v.aceite && <span className="ml-2 text-[11px] font-bold text-good">aceite</span>}
                  </b>
                  <span className="text-xs text-soft">{dataCurta(v.criado_em)}</span>
                </div>
                <p className="mt-1 text-grey">
                  {v.avenca_valor ? `${euros(v.avenca_valor)}/mês` : "—"}
                  {v.setup_valor ? ` · setup ${euros(v.setup_valor)}` : ""}
                  {d.deltaAvenca != null && d.deltaAvenca !== 0 && (
                    <span className={d.deltaAvenca > 0 ? "text-good" : "text-bad"}>
                      {" "}
                      ({d.deltaAvenca > 0 ? "+" : ""}
                      {euros(d.deltaAvenca)}/mês vs v{v.versao - 1})
                    </span>
                  )}
                </p>
                {(d.ambitoAdicionado.length > 0 || d.ambitoRemovido.length > 0) && (
                  <p className="mt-0.5 text-[11px] text-soft">
                    {d.ambitoAdicionado.length > 0 && (
                      <span className="text-good">+ {d.ambitoAdicionado.join(", ")}</span>
                    )}
                    {d.ambitoAdicionado.length > 0 && d.ambitoRemovido.length > 0 && " · "}
                    {d.ambitoRemovido.length > 0 && (
                      <span className="text-bad">− {d.ambitoRemovido.join(", ")}</span>
                    )}
                  </p>
                )}
                {v.motivo && <p className="mt-0.5 text-[11px] text-soft">{v.motivo}</p>}
              </div>
            );
          })}
        </div>
      )}

      <form action={congelarVersaoForm} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={propostaId} />
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-[11px] font-bold text-grey">Motivo da nova versão</label>
          <input
            name="motivo"
            placeholder="ex.: alteração de âmbito, renovação, renegociação"
            className={inp}
          />
        </div>
        <button className="rounded-full border-2 border-gold-dark px-4 py-2 text-sm font-bold text-gold-dark">
          Congelar versão
        </button>
      </form>
    </section>
  );
}
