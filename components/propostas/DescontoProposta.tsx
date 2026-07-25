import { euros } from "@/lib/dominio/metricas";
import { dataCurta } from "@/lib/dominio/metricas";
import { guardarDesconto, apagarDesconto } from "@/app/(app)/propostas/acoes";

export type Desconto = {
  id: string;
  alvo: string;
  valor_normal: number;
  tipo: string;
  valor_desconto: number;
  preco_durante: number | null;
  preco_apos: number | null;
  motivo: string | null;
  inicio: string | null;
  duracao_meses: number | null;
  fim: string | null;
};

const inp = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold";

export function DescontoProposta({
  clienteId,
  propostaId,
  avencaValor,
  setupValor,
  descontos,
}: {
  clienteId: string;
  propostaId: string;
  avencaValor: number | null;
  setupValor: number | null;
  descontos: Desconto[];
}) {
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="font-display text-lg font-extrabold">Desconto (condição de lançamento)</h2>
      <p className="mb-3 text-xs text-soft">
        Um preço nunca é «substituído» sem explicação. Aqui o valor normal fica registado e o cliente
        vê a condição inicial e o valor depois.
      </p>

      {descontos.length > 0 && (
        <div className="mb-4 space-y-2">
          {descontos.map((d) => {
            const mes = d.alvo === "avenca" ? "/mês" : "";
            return (
              <div key={d.id} className="rounded-lg border-2 border-gold/40 bg-gold/5 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b>{d.alvo === "setup" ? "Arranque" : "Avença"}</b>
                  <form action={apagarDesconto.bind(null, d.id)}>
                    <button className="text-xs text-bad">remover</button>
                  </form>
                </div>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  <p>
                    Valor normal: <b>{euros(d.valor_normal)}{mes}</b>
                  </p>
                  <p>
                    Desconto:{" "}
                    <b className="text-gold-dark">
                      {d.tipo === "percentagem" ? `−${d.valor_desconto}%` : `−${euros(d.valor_desconto)}`}
                    </b>
                  </p>
                  <p>
                    Durante {d.duracao_meses ? `${d.duracao_meses} meses` : "o período"}:{" "}
                    <b className="text-good">{d.preco_durante != null ? `${euros(d.preco_durante)}${mes}` : "—"}</b>
                    {d.fim && <span className="text-soft"> (até {dataCurta(d.fim)})</span>}
                  </p>
                  <p>
                    Depois: <b>{d.preco_apos != null ? `${euros(d.preco_apos)}${mes}` : "—"}</b>
                  </p>
                </div>
                {d.motivo && <p className="mt-1 text-xs text-soft">Motivo: {d.motivo}</p>}
              </div>
            );
          })}
        </div>
      )}

      <form action={guardarDesconto} className="grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="cliente_id" value={clienteId} />
        <input type="hidden" name="proposta_id" value={propostaId} />
        <input type="hidden" name="avenca_valor" value={avencaValor ?? 0} />
        <input type="hidden" name="setup_valor" value={setupValor ?? 0} />

        <div>
          <label className="mb-1 block text-[11px] font-bold text-grey">Aplica a</label>
          <select name="alvo" className={inp}>
            <option value="avenca">Avença (mensal)</option>
            <option value="setup">Arranque (setup)</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-grey">Tipo</label>
            <select name="tipo" className={inp}>
              <option value="percentagem">Percentagem</option>
              <option value="fixo">Valor fixo</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-grey">Valor (% ou €)</label>
            <input name="valor_desconto" type="number" step="0.01" min="0" className={`${inp} tabular-nums`} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-grey">Início</label>
            <input name="inicio" type="date" className={inp} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-grey">Duração (meses)</label>
            <input name="duracao_meses" type="number" min="0" className={`${inp} tabular-nums`} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold text-grey">Motivo *</label>
          <input name="motivo" required placeholder="ex.: condição de lançamento" className={inp} />
        </div>
        <button className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink sm:col-span-2">
          Guardar desconto
        </button>
      </form>
    </section>
  );
}
