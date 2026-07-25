import { guardarServico, desativarServico } from "@/app/(app)/propostas/acoes";

export type Servico = {
  chave: string;
  rotulo: string;
  rotulo_en: string | null;
  categoria: string | null;
  tipo: string;
  cobranca: string | null;
  unidade: string;
  estado: string;
  preco: number | null;
  preco_minimo: number | null;
  percentagem: number | null;
  minutos: number | null;
  custo_interno: number | null;
  tempo_planeado_min: number | null;
  limite_revisoes: number | null;
  descricao_interna: string | null;
  desc_cliente_pt: string | null;
  desc_cliente_en: string | null;
  inclusoes: string | null;
  exclusoes: string | null;
  dependencias: string | null;
  notas_internas: string | null;
  permite_desconto: boolean;
  mostrar_discriminado: boolean;
};

const inp = "w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold";
const lab = "mb-1 block text-[11px] font-bold text-grey";

function Campo({ id, label, children }: { id?: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={lab}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function EditorServico({ s }: { s: Servico }) {
  const custom = s.chave.startsWith("svc_");
  const aDefinir = s.estado === "a_definir" || s.preco === null;
  const margem =
    s.preco && s.custo_interno != null ? Math.round(((s.preco - s.custo_interno) / s.preco) * 100) : null;
  const eurHora =
    s.preco && s.tempo_planeado_min ? Math.round((s.preco / s.tempo_planeado_min) * 60) : null;

  return (
    <details className="group border-b border-line/60 last:border-0 open:bg-cream/40">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-3 text-sm">
        <span className="min-w-0 flex-1">
          <b>{s.rotulo}</b>
          {s.categoria && (
            <span className="ml-2 rounded-full bg-cobalt/10 px-2 py-0.5 text-[10px] font-bold text-cobalt">
              {s.categoria}
            </span>
          )}
          {aDefinir && (
            <span className="ml-2 rounded-full bg-warn/20 px-2 py-0.5 text-[10px] font-bold text-warn">
              a definir
            </span>
          )}
        </span>
        <span className="shrink-0 font-mono text-sm tabular-nums">
          {s.preco == null ? <span className="text-warn">—</span> : `${s.preco}€`}
        </span>
        <span className="shrink-0 text-xs font-bold text-gold-dark group-open:hidden">editar</span>
        <span className="shrink-0 text-soft transition group-open:rotate-90">›</span>
      </summary>

      <form action={guardarServico} className="space-y-4 pb-4">
        <input type="hidden" name="chave" value={s.chave} />

        {aDefinir && (
          <p className="rounded-lg border-2 border-warn bg-warn/10 p-2.5 text-xs">
            ⚠️ Este serviço ainda não tem preço definido. Define o preço aqui para o poderes usar numa
            proposta.
          </p>
        )}

        {/* Identificação */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id={`r_${s.chave}`} label="Nome comercial (PT) *">
            <input id={`r_${s.chave}`} name="rotulo" defaultValue={s.rotulo} required className={inp} />
          </Campo>
          <Campo label="Nome comercial (EN)">
            <input name="rotulo_en" defaultValue={s.rotulo_en ?? ""} className={inp} />
          </Campo>
          <Campo label="Categoria">
            <input name="categoria" defaultValue={s.categoria ?? ""} className={inp} />
          </Campo>
          <div className="grid grid-cols-3 gap-2">
            <Campo label="Cobrança">
              <select name="cobranca" defaultValue={s.cobranca ?? s.tipo} className={inp}>
                <option value="mensal">Mensal</option>
                <option value="setup">Setup</option>
                <option value="extra">Extra</option>
                <option value="custo_externo">Custo externo</option>
              </select>
            </Campo>
            <Campo label="Unidade">
              <select name="unidade" defaultValue={s.unidade} className={inp}>
                {["unidade", "mês", "canal", "pagina", "plataforma", "hora", "projeto", "fixo"].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Estado">
              <select name="estado" defaultValue={s.estado} className={inp}>
                <option value="ativo">Ativo</option>
                <option value="a_definir">A definir</option>
                <option value="inativo">Inativo</option>
              </select>
            </Campo>
          </div>
        </div>

        {/* Preço e esforço */}
        <div className="rounded-lg border border-line bg-white p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Campo label="Preço (€)">
              <input name="preco" type="number" step="0.01" min="0" defaultValue={s.preco ?? ""} placeholder="—" className={`${inp} tabular-nums ${s.preco == null ? "border-warn bg-warn/5" : ""}`} />
            </Campo>
            <Campo label="Preço mínimo (€)">
              <input name="preco_minimo" type="number" step="0.01" min="0" defaultValue={s.preco_minimo ?? ""} className={`${inp} tabular-nums`} />
            </Campo>
            <Campo label="Percentagem (%)">
              <input name="percentagem" type="number" step="0.1" min="0" defaultValue={s.percentagem ?? ""} className={`${inp} tabular-nums`} />
            </Campo>
            <Campo label="Limite de revisões">
              <input name="limite_revisoes" type="number" min="0" defaultValue={s.limite_revisoes ?? ""} className={`${inp} tabular-nums`} />
            </Campo>
            <Campo label="Custo interno (€)">
              <input name="custo_interno" type="number" step="0.01" min="0" defaultValue={s.custo_interno ?? ""} className={`${inp} tabular-nums`} />
            </Campo>
            <Campo label="Tempo planeado (min)">
              <input name="tempo_planeado_min" type="number" min="0" defaultValue={s.tempo_planeado_min ?? ""} className={`${inp} tabular-nums`} />
            </Campo>
            <Campo label="Minutos (produção)">
              <input name="minutos" type="number" min="0" defaultValue={s.minutos ?? ""} className={`${inp} tabular-nums`} />
            </Campo>
            <div className="self-end text-xs text-grey">
              {margem !== null && (
                <p>
                  margem ≈ <b className={margem < 30 ? "text-bad" : "text-good"}>{margem}%</b>
                </p>
              )}
              {eurHora !== null && (
                <p>
                  ≈ <b>{eurHora}€/h</b>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* O que o cliente lê */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Descrição para o cliente (PT)">
            <textarea name="desc_cliente_pt" rows={2} defaultValue={s.desc_cliente_pt ?? ""} className={inp} />
          </Campo>
          <Campo label="Descrição para o cliente (EN)">
            <textarea name="desc_cliente_en" rows={2} defaultValue={s.desc_cliente_en ?? ""} className={inp} />
          </Campo>
          <Campo label="Inclui">
            <textarea name="inclusoes" rows={2} defaultValue={s.inclusoes ?? ""} className={inp} />
          </Campo>
          <Campo label="Não inclui">
            <textarea name="exclusoes" rows={2} defaultValue={s.exclusoes ?? ""} className={inp} />
          </Campo>
        </div>

        {/* Interno */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Descrição interna">
            <input name="descricao_interna" defaultValue={s.descricao_interna ?? ""} className={inp} />
          </Campo>
          <Campo label="Dependências">
            <input name="dependencias" defaultValue={s.dependencias ?? ""} className={inp} />
          </Campo>
          <Campo label="Notas internas">
            <input name="notas_internas" defaultValue={s.notas_internas ?? ""} className={inp} />
          </Campo>
          <Campo label="Motivo (se mudaste o preço — para o histórico)">
            <input name="motivo" placeholder="ex.: ajuste de custos" className={inp} />
          </Campo>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-grey">
            <input type="checkbox" name="permite_desconto" defaultChecked={s.permite_desconto} className="size-4 accent-[#E8A13C]" />
            permite desconto
          </label>
          <label className="flex items-center gap-2 text-xs text-grey">
            <input type="checkbox" name="mostrar_discriminado" defaultChecked={s.mostrar_discriminado} className="size-4 accent-[#E8A13C]" />
            pode aparecer discriminado ao cliente
          </label>
          <span className="flex-1" />
          <button className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink">Guardar</button>
          {custom && (
            <button formAction={desativarServico.bind(null, s.chave)} formNoValidate className="text-xs font-bold text-bad">
              remover
            </button>
          )}
        </div>
      </form>
    </details>
  );
}
