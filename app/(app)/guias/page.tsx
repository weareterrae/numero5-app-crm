import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CopiarLink } from "@/components/guia/CopiarLink";

export const dynamic = "force-dynamic";

// Domínio público onde vive o guia por token (app/guia/[token]).
const BASE = "https://app.numerocinco.pt";
// Nº de campos do formulário — ver app/sede/guia/GuiaForm.tsx (SECOES).
const TOTAL_CAMPOS = 25;

type GuiaMarca = Record<string, unknown> & {
  _concluido?: boolean;
  _atualizado?: string;
  _prefill?: string;
};

type Linha = {
  id: string;
  nome: string;
  token: string | null;
  preenchidos: number;
  concluido: boolean;
  prefill: boolean;
  atualizado: string | null;
  anexos: number;
  anexosNomes: string[];
};

function estado(l: Linha): { txt: string; cls: string } {
  if (l.concluido) return { txt: "Concluído", cls: "border-good/30 bg-good/10 text-good" };
  if (l.preenchidos > 0) return { txt: "Em curso", cls: "border-gold/40 bg-gold/15 text-gold-dark" };
  return { txt: "Por preencher", cls: "border-line bg-cream text-grey" };
}

function quando(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

async function carregar(): Promise<Linha[]> {
  const sb = await criarClienteServidor();

  let clientes: { id: string; nome_marca: string; guia_marca: GuiaMarca | null; guia_token: string | null }[] = [];
  try {
    const { data } = await sb
      .from("clientes")
      .select("id, nome_marca, guia_marca, guia_token")
      .order("nome_marca", { ascending: true });
    clientes = (data ?? []) as typeof clientes;
  } catch {
    clientes = [];
  }

  // Materiais por cliente (best-effort — não parte se a tabela faltar).
  const anexos = new Map<string, string[]>();
  try {
    const ids = clientes.map((c) => c.id);
    if (ids.length) {
      const { data: mats } = await sb.from("materiais_cliente").select("cliente_id, nome").in("cliente_id", ids);
      for (const m of (mats ?? []) as { cliente_id: string; nome: string }[]) {
        const arr = anexos.get(m.cliente_id) ?? [];
        arr.push(m.nome);
        anexos.set(m.cliente_id, arr);
      }
    }
  } catch {
    /* sem materiais */
  }

  const linhas: Linha[] = clientes.map((c) => {
    const g = (c.guia_marca && typeof c.guia_marca === "object" ? c.guia_marca : {}) as GuiaMarca;
    const preenchidos = Object.entries(g).filter(
      ([k, v]) => !k.startsWith("_") && typeof v === "string" && v.trim(),
    ).length;
    const nomes = anexos.get(c.id) ?? [];
    return {
      id: c.id,
      nome: c.nome_marca || "—",
      token: c.guia_token,
      preenchidos,
      concluido: g._concluido === true,
      prefill: typeof g._prefill === "string",
      atualizado: typeof g._atualizado === "string" ? g._atualizado : null,
      anexos: nomes.length,
      anexosNomes: nomes,
    };
  });

  const rank = (l: Linha) => (l.concluido ? 0 : l.preenchidos > 0 ? 1 : 2);
  linhas.sort((a, b) => rank(a) - rank(b) || (b.atualizado ?? "").localeCompare(a.atualizado ?? ""));
  return linhas;
}

export default async function GuiasPage() {
  const linhas = await carregar();
  const concluidos = linhas.filter((l) => l.concluido).length;
  const emCurso = linhas.filter((l) => !l.concluido && l.preenchidos > 0).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="rotulo">briefings das marcas</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Guias da Marca</h1>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="rounded-full border border-line bg-white px-3 py-1.5 font-bold text-grey">
            {emCurso} em curso
          </span>
          <span className="rounded-full border border-good/30 bg-good/10 px-3 py-1.5 font-bold text-good">
            {concluidos} concluídos
          </span>
        </div>
      </div>

      {linhas.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-8 text-center text-grey">
          Ainda não há guias na carteira.
        </div>
      ) : (
        <div className="grid gap-3">
          {linhas.map((l) => {
            const e = estado(l);
            const pct = Math.min(100, Math.round((l.preenchidos / TOTAL_CAMPOS) * 100));
            const url = l.token ? `${BASE}/guia/${l.token}` : null;
            return (
              <div key={l.id} className="rounded-2xl border border-line bg-white p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <div className="min-w-[170px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-lg font-extrabold tracking-tight">{l.nome}</span>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${e.cls}`}>{e.txt}</span>
                      {l.prefill && !l.concluido ? (
                        <span className="rounded-full border border-line bg-cream px-2 py-0.5 text-[10px] font-bold text-grey">
                          pré-preenchido
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-grey">
                      {l.preenchidos}/{TOTAL_CAMPOS} campos · {l.anexos}{" "}
                      {l.anexos === 1 ? "material" : "materiais"} · atualizado {quando(l.atualizado)}
                    </p>
                  </div>

                  <div className="w-40">
                    <div className="h-2 overflow-hidden rounded-full bg-cream">
                      <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/clientes/${l.id}`}
                      className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-grey hover:text-ink"
                    >
                      Ficha
                    </Link>
                    {url ? (
                      <>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-cream"
                        >
                          Abrir guia ↗
                        </a>
                        <CopiarLink url={url} />
                      </>
                    ) : null}
                  </div>
                </div>

                {l.anexos > 0 ? (
                  <p className="mt-2 truncate text-xs text-soft" title={l.anexosNomes.join(" · ")}>
                    📎 {l.anexosNomes.slice(0, 6).join(" · ")}
                    {l.anexos > 6 ? ` +${l.anexos - 6}` : ""}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
