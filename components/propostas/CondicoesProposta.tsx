import { guardarCondicoes } from "@/app/(app)/propostas/acoes";
import { euros, dataCurta } from "@/lib/dominio/metricas";
import { contratoDatas, planoPagamentoFundacao } from "@/lib/dominio/operacao";

export type Condicoes = {
  inclui?: string | null;
  exclui?: string | null;
  prazo_arranque?: string | null;
  politica_revisoes?: string | null;
  forma_pagamento?: string | null;
  data_inicio?: string | null;
  duracao_meses?: number | null;
  aviso_dias?: number | null;
  renovacao?: string | null;
  pagamento_fundacao?: string | null;
  pagamento_fundacao_fases?: string | null;
  moeda_nota?: string | null;
};

const inp = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold";
const lab = "mb-1 block text-[11px] font-bold text-grey";

export function CondicoesProposta({
  propostaId,
  validade,
  condicoes,
  setupValor,
}: {
  propostaId: string;
  validade: string | null;
  condicoes: Condicoes;
  setupValor: number | null;
}) {
  const semValidade = !validade;
  const datas = contratoDatas(
    condicoes.data_inicio,
    condicoes.duracao_meses,
    condicoes.aviso_dias,
  );
  const planoFundacao =
    setupValor && setupValor > 0
      ? planoPagamentoFundacao(condicoes.pagamento_fundacao, setupValor)
      : [];
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="font-display text-lg font-extrabold">Condições da proposta</h2>
      <p className="mb-3 text-xs text-soft">
        O que fecha o documento: até quando é válida, o que inclui e exclui, quando arranca, revisões
        e pagamento. Nada fica implícito.
      </p>

      {semValidade && (
        <div className="mb-3 rounded-lg border-2 border-warn bg-warn/10 p-3 text-sm">
          <b>⚠️ Sem validade.</b> Define uma data antes de partilhar — uma proposta sem prazo fica em
          aberto para sempre.
        </div>
      )}

      <form action={guardarCondicoes} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" value={propostaId} />

        <div>
          <label className={lab}>Válida até</label>
          <input type="date" name="validade" defaultValue={validade ?? ""} className={inp} />
        </div>
        <div>
          <label className={lab}>Prazo de arranque</label>
          <input
            name="prazo_arranque"
            defaultValue={condicoes.prazo_arranque ?? ""}
            placeholder="ex.: arrancamos até 5 dias úteis após o sim"
            className={inp}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={lab}>Inclui</label>
          <textarea
            name="inclui"
            rows={2}
            defaultValue={condicoes.inclui ?? ""}
            placeholder="ex.: tudo o que está no âmbito acima, com aprovação humana"
            className={inp}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={lab}>Não inclui</label>
          <textarea
            name="exclui"
            rows={2}
            defaultValue={condicoes.exclui ?? ""}
            placeholder="ex.: verba de anúncios, produção de vídeo com equipa externa, licenças de stock"
            className={inp}
          />
        </div>

        <div>
          <label className={lab}>Política de revisões</label>
          <input
            name="politica_revisoes"
            defaultValue={condicoes.politica_revisoes ?? ""}
            placeholder="ex.: até 2 rondas por peça"
            className={inp}
          />
        </div>
        <div>
          <label className={lab}>Forma de pagamento</label>
          <input
            name="forma_pagamento"
            defaultValue={condicoes.forma_pagamento ?? ""}
            placeholder="ex.: avença mensal por transferência, a 8 dias"
            className={inp}
          />
        </div>

        {/* Duração e renovação da avença */}
        <div className="sm:col-span-2 mt-1 border-t border-line pt-3">
          <p className="rotulo">duração da avença</p>
        </div>
        <div>
          <label className={lab}>Início</label>
          <input type="date" name="data_inicio" defaultValue={condicoes.data_inicio ?? ""} className={inp} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lab}>Duração mínima (meses)</label>
            <input
              name="duracao_meses"
              type="number"
              min="0"
              defaultValue={condicoes.duracao_meses ?? 3}
              className={`${inp} tabular-nums`}
            />
          </div>
          <div>
            <label className={lab}>Aviso prévio (dias)</label>
            <input
              name="aviso_dias"
              type="number"
              min="0"
              defaultValue={condicoes.aviso_dias ?? 30}
              className={`${inp} tabular-nums`}
            />
          </div>
        </div>
        <div>
          <label className={lab}>Renovação</label>
          <select name="renovacao" defaultValue={condicoes.renovacao ?? "automatica"} className={inp}>
            <option value="automatica">Automática (mensal)</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        {datas.renovacao && (
          <p className="sm:col-span-2 text-xs text-soft">
            Renova a <b className="text-ink">{dataCurta(datas.renovacao)}</b>
            {datas.aviso && <> · avisar até <b className="text-ink">{dataCurta(datas.aviso)}</b></>}
            {datas.revisaoPreco && <> · rever preço em <b className="text-ink">{dataCurta(datas.revisaoPreco)}</b></>}
          </p>
        )}

        {/* Pagamento da Fundação (quando há setup) */}
        {setupValor != null && setupValor > 0 && (
          <>
            <div className="sm:col-span-2 mt-1 border-t border-line pt-3">
              <p className="rotulo">pagamento da fundação (arranque)</p>
            </div>
            <div>
              <label className={lab}>Modelo</label>
              <select
                name="pagamento_fundacao"
                defaultValue={condicoes.pagamento_fundacao ?? "50_50"}
                className={inp}
              >
                <option value="50_50">50% adjudicação + 50% entrega</option>
                <option value="100">100% na adjudicação</option>
                <option value="fases">Fases personalizadas</option>
              </select>
            </div>
            <div>
              <label className={lab}>Fases personalizadas (se aplicável)</label>
              <input
                name="pagamento_fundacao_fases"
                defaultValue={condicoes.pagamento_fundacao_fases ?? ""}
                placeholder="ex.: 40% + 30% + 30%"
                className={inp}
              />
            </div>
            {planoFundacao.length > 0 && condicoes.pagamento_fundacao !== "fases" && (
              <p className="sm:col-span-2 text-xs text-soft">
                {planoFundacao.map((f) => `${f.rotulo}: ${euros(f.valor)}`).join(" · ")}
              </p>
            )}
          </>
        )}

        <div className="sm:col-span-2 mt-1 border-t border-line pt-3">
          <p className="rotulo">moeda local (opcional · ex.: Angola)</p>
          <label className={lab}>Nota de equivalência — escrita por ti, nunca automática</label>
          <input
            name="moeda_nota"
            defaultValue={condicoes.moeda_nota ?? ""}
            placeholder="ex.: Equivalente indicativo: 950 000 Kz/mês · câmbio de referência de 27-07-2026"
            className={inp}
          />
        </div>

        <button className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink sm:col-span-2">
          Guardar condições
        </button>
      </form>
    </section>
  );
}
