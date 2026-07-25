"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CANAIS,
  CHAVES_ESTRUTURADAS,
  ESCOPO_VAZIO,
  calcular,
  canaisAtivos,
  descreverEscopo,
  normalizarEscopo,
  pecasPorMes,
  type ChaveCanal,
  type Escopo,
  type Preco,
  type Producao,
  type TipoSite,
} from "@/lib/dominio/orcamento";
import { euros } from "@/lib/dominio/metricas";
import { guardarEscopo } from "@/app/(app)/propostas/acoes";

const PECAS: [keyof Producao, string][] = [
  ["posts", "Posts"],
  ["carrosseis", "Carrosséis"],
  ["reels", "Reels"],
  ["stories", "Histórias"],
];

const SITES: [TipoSite, string][] = [
  ["nenhum", "Não mexemos no site"],
  ["melhorias", "Melhorias ao atual"],
  ["novo", "Site novo"],
  ["loja", "Loja online"],
];

const EXTRAS: [keyof Escopo["extras"], string, string?][] = [
  ["identidade", "Identidade e estratégia"],
  ["montar_perfis", "Montar os perfis"],
  ["moderacao", "Respostas com aprovação", "comentários, menções e mensagens"],
  ["assistente", "Assistente no site"],
  ["anuncios", "Gestão de anúncios"],
  ["relatorio", "Relatório mensal"],
];

export function Configurador({
  propostaId,
  inicial,
  precos,
}: {
  propostaId: string;
  inicial: unknown;
  precos: Preco[];
}) {
  const [e, setE] = useState<Escopo>(() => normalizarEscopo(inicial));
  const [estado, setEstado] = useState("");
  const [aGuardar, setAGuardar] = useState(false);
  // O valor a propor: por defeito é o custo calculado, mas podes propor menos.
  const [override, setOverride] = useState(false);
  const [setupProp, setSetupProp] = useState("");
  const [mensalProp, setMensalProp] = useState("");

  const orc = useMemo(() => calcular(e, precos), [e, precos]);
  const pecas = pecasPorMes(e);
  const ativos = canaisAtivos(e);
  const semPrecos = precos.every((p) => p.preco === null);

  const setupFinal = override ? Math.max(0, Number(setupProp) || 0) : orc.totalSetup;
  const mensalFinal = override ? Math.max(0, Number(mensalProp) || 0) : orc.totalMensal;

  // Serviços à medida do catálogo (tudo o que não é gerido pelos controlos acima).
  const outros = precos.filter(
    (p) => !CHAVES_ESTRUTURADAS.has(p.chave) && p.chave !== "anuncios_pct",
  );
  const qtdServico = (chave: string) =>
    (e.servicos ?? []).find((s) => s.chave === chave)?.quantidade ?? 0;
  function setServico(chave: string, rotulo: string, quantidade: number) {
    setE((prev) => {
      const outrosServicos = (prev.servicos ?? []).filter((s) => s.chave !== chave);
      return {
        ...prev,
        servicos: quantidade > 0 ? [...outrosServicos, { chave, rotulo, quantidade }] : outrosServicos,
      };
    });
  }

  function mudarCanal(k: ChaveCanal, campo: "ativo" | "proprio", valor: boolean) {
    setE((prev) => {
      const atual = prev.canais[k] ?? { ativo: false, proprio: false };
      return { ...prev, canais: { ...prev.canais, [k]: { ...atual, [campo]: valor } } };
    });
  }

  function ligarOverride(on: boolean) {
    setOverride(on);
    if (on) {
      // arranca com o valor calculado, para baixares a partir dele
      if (!setupProp) setSetupProp(String(orc.totalSetup || ""));
      if (!mensalProp) setMensalProp(String(orc.totalMensal || ""));
    }
  }

  async function guardar() {
    setAGuardar(true);
    const r = await guardarEscopo(propostaId, e, descreverEscopo(e), mensalFinal, setupFinal);
    setAGuardar(false);
    setEstado(r.ok ? "Guardado ✓ — é este o valor que vai na proposta." : `⚠️ ${r.erro}`);
    setTimeout(() => setEstado(""), 4000);
  }

  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="font-display text-lg font-extrabold">Âmbito e orçamento</h2>
      <p className="mb-4 text-xs text-soft">
        A produção conta-se uma vez; os canais só acrescentam gestão. É assim que o valor reflete o
        trabalho real.
      </p>

      {semPrecos && (
        <div className="mb-4 rounded-lg border-2 border-warn bg-warn/10 p-3 text-sm">
          <b>Ainda não definiste os teus preços unitários.</b> Define-os uma vez em{" "}
          <Link href="/definicoes/precos" className="font-bold underline">
            Definições → Preços
          </Link>
          .
        </div>
      )}

      {/* 1. Produção */}
      <h3 className="mb-1 text-sm font-bold">1. O que produzimos por mês</h3>
      <p className="mb-2 text-xs text-soft">
        Peças <b>únicas</b>. Se o mesmo post sai no Instagram e no Facebook, conta uma vez.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PECAS.map(([campo, rotulo]) => (
          <div key={campo}>
            <label className="mb-0.5 block text-[11px] text-grey">{rotulo}</label>
            <input
              type="number"
              min={0}
              value={e.producao[campo]}
              onChange={(ev) => {
                const v = Math.max(0, +ev.target.value || 0);
                setE((prev) => ({ ...prev, producao: { ...prev.producao, [campo]: v } }));
              }}
              className="w-full rounded-lg border border-line px-2.5 py-2 text-sm tabular-nums"
            />
          </div>
        ))}
      </div>

      {/* 2. Canais */}
      <h3 className="mt-5 mb-1 text-sm font-bold">2. Onde é publicado</h3>
      <p className="mb-2 text-xs text-soft">
        O 1.º canal leva gestão completa; os seguintes, valor reduzido. Marca «conteúdo próprio» se
        um canal precisar de peças diferentes — aí é trabalho a dobrar e paga gestão completa.
      </p>
      <div className="space-y-1.5">
        {CANAIS.map(([k, nome]) => {
          const c = e.canais[k] ?? { ativo: false, proprio: false };
          return (
            <div
              key={k}
              className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${
                c.ativo ? "border-gold bg-gold/5" : "border-line"
              }`}
            >
              <label className="flex flex-1 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={c.ativo}
                  onChange={(ev) => mudarCanal(k, "ativo", ev.target.checked)}
                  className="size-4 accent-[#E8A13C]"
                />
                <span className="text-sm font-bold">{nome}</span>
              </label>
              {c.ativo && (
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-grey">
                  <input
                    type="checkbox"
                    checked={c.proprio}
                    onChange={(ev) => mudarCanal(k, "proprio", ev.target.checked)}
                    className="size-3.5 accent-[#2B44E7]"
                  />
                  conteúdo próprio
                </label>
              )}
            </div>
          );
        })}
      </div>
      {ativos.length > 1 && (
        <p className="mt-2 text-xs text-cobalt">
          {ativos.length} canais · o conteúdo é adaptado, não reproduzido — por isso não pagas
          produção a dobrar.
        </p>
      )}

      {/* 3. Site */}
      <h3 className="mt-5 mb-2 text-sm font-bold">3. Site</h3>
      <div className="flex flex-wrap gap-1.5">
        {SITES.map(([t, rotulo]) => (
          <button
            key={t}
            type="button"
            onClick={() => setE({ ...e, site: { ...e.site, tipo: t } })}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
              e.site.tipo === t ? "border-gold bg-gold text-ink" : "border-line text-grey"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {e.site.tipo === "novo" && (
        <div className="mt-2">
          <label className="mb-0.5 block text-[11px] text-grey">Quantas páginas</label>
          <input
            type="number"
            min={0}
            value={e.site.paginas}
            onChange={(ev) =>
              setE({ ...e, site: { ...e.site, paginas: Math.max(0, +ev.target.value || 0) } })
            }
            className="w-28 rounded-lg border border-line px-2.5 py-1.5 text-sm tabular-nums"
          />
        </div>
      )}

      {/* 4. Extras */}
      <h3 className="mt-5 mb-2 text-sm font-bold">4. Também incluído</h3>
      <div className="flex flex-wrap gap-1.5">
        {EXTRAS.map(([k, rotulo, nota]) => (
          <button
            key={k}
            type="button"
            title={nota}
            onClick={() => setE({ ...e, extras: { ...e.extras, [k]: !e.extras[k] } })}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
              e.extras[k] ? "border-gold bg-gold text-ink" : "border-line text-grey"
            }`}
          >
            {rotulo}
            {nota && <span className="ml-1 font-normal opacity-70">· {nota}</span>}
          </button>
        ))}
      </div>

      {e.extras.anuncios && (
        <div className="mt-3 rounded-lg border border-line bg-cream p-3">
          <label className="mb-1 block text-xs font-bold text-grey">
            Verba mensal de anúncios do cliente (€)
          </label>
          <input
            type="number"
            min={0}
            step="10"
            value={e.verba_anuncios || ""}
            onChange={(ev) =>
              setE({ ...e, verba_anuncios: Math.max(0, +ev.target.value || 0) })
            }
            placeholder="ex.: 300"
            className="w-36 rounded-lg border border-line px-2.5 py-1.5 text-sm tabular-nums"
          />
          <p className="mt-1.5 text-[11px] text-soft">
            Esta verba <b>não é receita nossa</b> — é o que ele paga às plataformas. Serve para
            calcular a gestão: cobramos o valor fixo ou a percentagem, o que for maior.
          </p>
        </div>
      )}

      {/* 5. Outros serviços do catálogo (vídeo, fotografia, apps…) */}
      {outros.length > 0 && (
        <>
          <h3 className="mt-5 mb-2 text-sm font-bold">5. Outros serviços</h3>
          <div className="space-y-1.5">
            {outros.map((p) => {
              const q = qtdServico(p.chave);
              return (
                <div
                  key={p.chave}
                  className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${
                    q > 0 ? "border-gold bg-gold/5" : "border-line"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-bold">{p.rotulo}</span>
                    <span className="ml-2 text-xs text-soft">
                      {p.preco !== null ? euros(p.preco) : "sem preço"}
                      {p.tipo === "setup" ? " · arranque" : "/mês"}
                    </span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={q || ""}
                    onChange={(ev) => setServico(p.chave, p.rotulo, Math.max(0, +ev.target.value || 0))}
                    placeholder="0"
                    aria-label={`Quantidade de ${p.rotulo}`}
                    className="w-20 rounded-lg border border-line px-2.5 py-1.5 text-sm tabular-nums"
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* A conta */}
      <div className="mt-5 rounded-xl bg-ink p-5 text-cream">
        <p className="rotulo !text-gold">a conta, à vista</p>

        {orc.mensal.length === 0 && orc.setup.length === 0 ? (
          <p className="mt-2 text-sm text-soft">Define a produção e os canais para veres o valor.</p>
        ) : (
          <>
            {orc.mensal.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-bold text-soft">TODOS OS MESES</p>
                {orc.mensal.map((l) => (
                  <Linha key={l.chave} l={l} />
                ))}
                <div className="mt-1.5 flex justify-between border-t border-white/15 pt-2">
                  <b className="text-sm">Custo mensal (calculado)</b>
                  <b className="font-display text-xl text-gold">{euros(orc.totalMensal)}</b>
                </div>
              </div>
            )}

            {orc.setup.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-bold text-soft">ARRANQUE, UMA VEZ</p>
                {orc.setup.map((l) => (
                  <Linha key={l.chave} l={l} />
                ))}
                <div className="mt-1.5 flex justify-between border-t border-white/15 pt-2">
                  <b className="text-sm">Arranque (calculado)</b>
                  <b className="font-display text-xl text-gold">{euros(orc.totalSetup)}</b>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-white/15 pt-3 text-xs text-soft">
              <span>
                <b className="text-cream">{pecas}</b> peças/mês
              </span>
              {ativos.length > 0 && (
                <span>
                  em <b className="text-cream">{ativos.length}</b>{" "}
                  {ativos.length === 1 ? "canal" : "canais"}
                </span>
              )}
              {orc.minutosMensais > 0 && (
                <span>
                  ≈ <b className="text-cream">{(orc.minutosMensais / 60).toFixed(1)}h</b> de trabalho
                </span>
              )}
              {orc.totalMensal > 0 && pecas > 0 && (
                <span>
                  <b className="text-cream">{euros(orc.totalMensal / pecas)}</b> por peça
                </span>
              )}
            </div>

            {orc.porDefinir.length > 0 && (
              <p className="mt-3 rounded-lg bg-bad/20 p-2 text-xs">
                ⚠️ {orc.porDefinir.join(", ")}: este serviço ainda não tem preço definido. Define o
                preço no catálogo (Definições → Preços) antes de concluir a proposta.
              </p>
            )}

            {/* O que se propõe — por defeito o custo, ou um valor teu (mais baixo). */}
            <div className="mt-4 border-t border-white/15 pt-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!override}
                  onChange={(ev) => ligarOverride(!ev.target.checked)}
                  className="size-4 accent-[#E8A13C]"
                />
                Propor exatamente este valor
              </label>

              {override && (
                <>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-0.5 block text-[11px] text-soft">Setup a propor (€)</label>
                      <input
                        type="number"
                        min={0}
                        value={setupProp}
                        onChange={(ev) => setSetupProp(ev.target.value)}
                        className="w-full rounded border border-white/20 bg-ink px-2 py-1.5 text-sm tabular-nums text-cream"
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[11px] text-soft">Avença a propor (€)</label>
                      <input
                        type="number"
                        min={0}
                        value={mensalProp}
                        onChange={(ev) => setMensalProp(ev.target.value)}
                        className="w-full rounded border border-white/20 bg-ink px-2 py-1.5 text-sm tabular-nums text-cream"
                      />
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11px] text-soft">
                    Podes propor abaixo do custo — é o teu investimento na relação.
                  </p>
                </>
              )}

              <div className="mt-2 flex items-baseline justify-between gap-2 text-sm">
                <span className="text-soft">Vai na proposta</span>
                <span className="font-bold text-gold">
                  {setupFinal > 0 ? `setup ${euros(setupFinal)}` : ""}
                  {setupFinal > 0 && mensalFinal > 0 ? " · " : ""}
                  {mensalFinal > 0 ? `${euros(mensalFinal)}/mês` : ""}
                  {setupFinal === 0 && mensalFinal === 0 ? "—" : ""}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={aGuardar || orc.porDefinir.length > 0}
          title={orc.porDefinir.length > 0 ? "Há serviços sem preço definido." : undefined}
          className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink disabled:opacity-60"
        >
          {aGuardar ? "A guardar…" : "Guardar âmbito e valores"}
        </button>
        {estado && <span className="text-sm font-bold text-good">{estado}</span>}
      </div>
    </section>
  );
}

function Linha({
  l,
}: {
  l: { rotulo: string; quantidade: number; precoUnitario: number | null; total: number | null };
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-cream/90">
        {l.rotulo}
        <span className="text-soft">
          {" "}
          × {l.quantidade}
          {l.precoUnitario !== null ? ` · ${euros(l.precoUnitario)}` : ""}
        </span>
      </span>
      <span className="shrink-0 font-mono tabular-nums">
        {l.total === null ? <span className="text-bad">por definir</span> : euros(l.total)}
      </span>
    </div>
  );
}
