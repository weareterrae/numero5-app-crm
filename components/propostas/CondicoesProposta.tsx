import { guardarCondicoes } from "@/app/(app)/propostas/acoes";

export type Condicoes = {
  inclui?: string | null;
  exclui?: string | null;
  prazo_arranque?: string | null;
  politica_revisoes?: string | null;
  forma_pagamento?: string | null;
};

const inp = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold";
const lab = "mb-1 block text-[11px] font-bold text-grey";

export function CondicoesProposta({
  propostaId,
  validade,
  condicoes,
}: {
  propostaId: string;
  validade: string | null;
  condicoes: Condicoes;
}) {
  const semValidade = !validade;
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

        <button className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink sm:col-span-2">
          Guardar condições
        </button>
      </form>
    </section>
  );
}
