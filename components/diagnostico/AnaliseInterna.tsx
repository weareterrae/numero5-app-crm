import {
  oportunidades,
  adequacaoLead,
  informacaoEmFalta,
  podeGerarProposta,
  type EntradaAnalise,
} from "@/lib/dominio/diagnostico/analise";
import { guardarAnalise } from "@/app/(app)/diagnosticos/acoes";

const PRIORIDADE_ROTULO: Record<string, string> = {
  ja: "resolver já",
  seguir: "construir a seguir",
  depois: "acelerar mais tarde",
};

const NIVEL: Record<string, { rotulo: string; cls: string }> = {
  boa: { rotulo: "Boa adequação", cls: "border-good bg-good/10 text-good" },
  possivel: { rotulo: "Possível", cls: "border-gold/50 bg-gold/10 text-gold-dark" },
  risco: { rotulo: "Risco elevado", cls: "border-warn bg-warn/10 text-warn" },
  fora: { rotulo: "Fora do perfil", cls: "border-bad bg-bad/10 text-bad" },
};

export function AnaliseInterna({
  diagnosticoId,
  entrada,
  analise,
}: {
  diagnosticoId: string;
  entrada: EntradaAnalise;
  analise: { resumo?: string | null; notas?: string | null };
}) {
  const ops = oportunidades(entrada);
  const adeq = adequacaoLead(entrada);
  const falta = informacaoEmFalta(entrada);
  const pode = podeGerarProposta(falta);
  const nivel = NIVEL[adeq.nivel];

  return (
    <section className="space-y-4 rounded-xl border-2 border-ink/10 bg-ink/[0.02] p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-extrabold">Análise interna</h2>
        <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-bold text-grey">
          só para ti · o cliente não vê
        </span>
      </div>

      {/* Informação em falta — o guarda-costas da proposta */}
      <div className="grid gap-2 sm:grid-cols-3">
        <Coluna titulo="Suficiente" itens={falta.suficiente} cls="text-good" />
        <Coluna titulo="A confirmar" itens={falta.confirmar} cls="text-warn" />
        <Coluna titulo="Crítico em falta" itens={falta.critica} cls="text-bad" />
      </div>
      {!pode && (
        <p className="rounded-lg border-2 border-bad bg-bad/10 p-3 text-sm font-bold text-bad">
          ⚠️ Falta informação crítica. A proposta pode não ter preço/âmbito fiáveis — confirma com o
          cliente antes de a fechar (ou avança em consciência).
        </p>
      )}

      {/* Adequação do lead */}
      <div className={`rounded-lg border-2 p-4 ${nivel.cls}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <b className="font-display text-base">{nivel.rotulo}</b>
          <span className="text-xs">{adeq.recomendacao}</span>
        </div>
        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
          <Mini titulo="A favor" itens={adeq.fatores} />
          <Mini titulo="Riscos" itens={adeq.riscos} />
          <Mini titulo="Em falta" itens={adeq.emFalta} />
        </div>
      </div>

      {/* Oportunidades concretas */}
      <div>
        <p className="rotulo mb-2">oportunidades concretas</p>
        {ops.length === 0 ? (
          <p className="text-sm text-soft">
            Sem sinais fortes no diagnóstico — trabalha o resumo à mão e confirma com o cliente.
          </p>
        ) : (
          <ul className="space-y-2">
            {ops.map((o, i) => (
              <li key={i} className="rounded-lg border border-line bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b>{o.titulo}</b>
                  <span className="flex items-center gap-2 text-[11px]">
                    <span className="rounded-full bg-cream px-2 py-0.5 font-bold text-grey">
                      {PRIORIDADE_ROTULO[o.prioridade]}
                    </span>
                    {o.confianca === "media" && <span className="text-soft">confiança média</span>}
                  </span>
                </div>
                <p className="mt-1 text-grey">{o.problema}</p>
                <p className="mt-0.5 text-[11px] text-soft">Evidência: {o.evidencia}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Resumo editável pelo operador */}
      <form action={guardarAnalise} className="space-y-2 border-t border-line pt-4">
        <input type="hidden" name="id" value={diagnosticoId} />
        <div>
          <label className="mb-1 block text-[11px] font-bold text-grey">
            Resumo do negócio (a tua leitura — entra na proposta)
          </label>
          <textarea
            name="resumo"
            rows={3}
            defaultValue={analise.resumo ?? ""}
            placeholder="Em 2-3 frases: o negócio, onde está, o que mais precisa."
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold text-grey">Notas internas</label>
          <textarea
            name="notas"
            rows={2}
            defaultValue={analise.notas ?? ""}
            placeholder="O que confirmar, cuidados, contexto que não vai para o cliente."
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
          />
        </div>
        <button className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-cream">
          Guardar análise
        </button>
      </form>
    </section>
  );
}

function Coluna({ titulo, itens, cls }: { titulo: string; itens: string[]; cls: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className={`text-[11px] font-bold uppercase tracking-wide ${cls}`}>{titulo}</p>
      {itens.length === 0 ? (
        <p className="mt-1 text-xs text-soft">—</p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-xs text-grey">
          {itens.map((i, k) => (
            <li key={k}>· {i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Mini({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <div>
      <p className="font-bold opacity-70">{titulo}</p>
      <ul className="mt-0.5 space-y-0.5">
        {itens.map((i, k) => (
          <li key={k}>· {i}</li>
        ))}
      </ul>
    </div>
  );
}
