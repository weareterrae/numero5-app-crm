"use client";

/**
 * Registar uma venda real da Terrae.
 *
 * DOIS ATOS, NUNCA UM. Escreve-se, vê-se o que ia acontecer, e só depois
 * se grava. Não é cerimónia: uma venda real ancora o motor com até 50%
 * do peso, e um zero a mais desloca as avaliações daquela zona durante
 * meses sem dar erro nenhum — o valor sai mais alto e continua plausível.
 *
 * O que a pré-visualização mostra é precisamente o que não se vê ao
 * escrever: o €/m² que sai da divisão, e em que zona da hierarquia a
 * venda vai cair. É aí que os enganos aparecem.
 */
import { useState } from "react";

type Aviso = { campo: string; texto: string };
type Previsao = {
  ok: boolean;
  gravado?: boolean;
  venda?: { eur_m2: number; area: number; preco_transacao: number; dias_mercado: number | null };
  onde?: string | null;
  avisos?: Aviso[];
  erros?: Aviso[];
  duplicada?: boolean;
};

const eur = (n: number) => n.toLocaleString("pt-PT") + " €";

export function FormularioVenda() {
  const [dados, setDados] = useState<Record<string, string>>({
    tipo: "Apartamento", tipologia: "T3", estado: "Bom estado",
  });
  const [r, setR] = useState<Previsao | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const p = (campo: string) => ({
    value: dados[campo] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setDados((d) => ({ ...d, [campo]: e.target.value }));
      setR(null);   // mexeu nos dados: a pré-visualização deixou de valer
    },
  });

  async function enviar(confirmar: boolean) {
    setOcupado(true);
    try {
      const res = await fetch("/api/imo/vendas" + (confirmar ? "?confirmar=1" : ""), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(dados),
      });
      setR(await res.json());
      if (confirmar) setDados({ tipo: "Apartamento", tipologia: "T3", estado: "Bom estado" });
    } catch {
      setR({ ok: false, erros: [{ campo: "", texto: "Não consegui falar com o servidor." }] });
    } finally {
      setOcupado(false);
    }
  }

  const gravada = r?.gravado === true;

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => { e.preventDefault(); enviar(false); }}
        className="space-y-5"
      >
        <div className="rounded-xl border border-line bg-white p-5 space-y-3">
          <p className="text-sm font-bold">O imóvel</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Seletor label="Tipo" {...p("tipo")} opcoes={["Apartamento", "Moradia", "Terreno", "Loja", "Armazém"]} />
            <Seletor label="Tipologia" {...p("tipologia")} opcoes={["T0", "T1", "T2", "T3", "T4", "T5 ou maior"]} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Concelho *" {...p("concelho")} placeholder="Oeiras" />
            <Campo label="Zona / freguesia" {...p("zona")} placeholder="Algés — quanto mais exata, melhor" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Área bruta privativa (m²) *" {...p("area")} placeholder="110" />
            <Campo label="Lote / terreno (m²)" {...p("lote")} placeholder="numa moradia" />
            <Campo label="Ano de construção" {...p("ano")} placeholder="1998" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Seletor label="Estado" {...p("estado")} opcoes={["Novo / recente", "Bom estado", "A renovar", "Para recuperar"]} />
            <Campo label="Características" {...p("caracteristicas")} placeholder="piscina, jardim, vista rio — separadas por vírgula" />
          </div>
        </div>

        <div className="rounded-xl border border-line bg-white p-5 space-y-3">
          <p className="text-sm font-bold">O negócio</p>
          <p className="text-xs text-soft">
            O preço de escritura é o que interessa ao motor. Os outros dois contam a história
            da negociação — e é dela que sai o desconto médio da zona.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Preço de escritura (€) *" {...p("preco_transacao")} placeholder="520.000" />
            <Campo label="Pedido inicial (€)" {...p("preco_inicial")} placeholder="560.000" />
            <Campo label="Último pedido (€)" {...p("preco_final_pedido")} placeholder="535.000" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Data da escritura *" type="date" {...p("data_transacao")} />
            <Campo label="Data do anúncio" type="date" {...p("data_anuncio")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Visitas" {...p("n_visitas")} placeholder="14" />
            <Campo label="Propostas" {...p("n_propostas")} placeholder="3" />
            <Campo label="Referência interna" {...p("referencia")} placeholder="alges-rua-x-3" />
          </div>
          <Campo label="Notas" {...p("notas")} placeholder="o que explica este preço a quem o ler daqui a um ano" />
        </div>

        <button
          type="submit"
          disabled={ocupado}
          className="rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-ink disabled:opacity-50"
        >
          {ocupado ? "a verificar…" : "Verificar"}
        </button>
      </form>

      {r && <Resultado r={r} ocupado={ocupado} aoGravar={() => enviar(true)} gravada={gravada} />}
    </div>
  );
}

function Resultado({ r, ocupado, aoGravar, gravada }: {
  r: Previsao; ocupado: boolean; aoGravar: () => void; gravada: boolean;
}) {
  if (gravada) {
    return (
      <div className="rounded-xl border-2 border-emerald-600 bg-emerald-50 p-5">
        <p className="font-bold text-emerald-900">Venda registada.</p>
        <p className="mt-1 text-sm text-emerald-800">
          Entra já nas próximas avaliações desta zona{r.onde ? ` (${r.onde})` : ""}.
        </p>
      </div>
    );
  }

  if (!r.ok) {
    return (
      <div className="rounded-xl border-2 border-red-500 bg-red-50 p-5">
        <p className="font-bold text-red-900">Não gravei — há coisas por resolver:</p>
        <ul className="mt-2 space-y-1 text-sm text-red-800">
          {(r.erros ?? []).map((e, i) => <li key={i}>· {e.texto}</li>)}
        </ul>
      </div>
    );
  }

  const v = r.venda!;
  return (
    <div className="rounded-xl border-2 border-gold-dark bg-white p-5 space-y-4">
      <div>
        <p className="rotulo">antes de gravar</p>
        <p className="font-display text-2xl font-extrabold">
          {v.eur_m2.toLocaleString("pt-PT")} €/m²
        </p>
        <p className="text-sm text-grey">
          {eur(v.preco_transacao)} ÷ {v.area} m²
          {v.dias_mercado != null ? ` · ${v.dias_mercado} dias no mercado` : ""}
        </p>
      </div>

      {r.onde && (
        <p className="text-sm">
          <span className="text-soft">fica em </span>
          <span className="font-bold">{r.onde}</span>
        </p>
      )}

      {r.duplicada && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          <b>Já existe uma venda igual</b> nesta zona, com esta área e este preço.
          Duas cópias dobram o peso dela no motor.
        </p>
      )}

      {(r.avisos ?? []).length > 0 && (
        <ul className="space-y-1.5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {(r.avisos ?? []).map((a, i) => <li key={i}>· {a.texto}</li>)}
        </ul>
      )}

      <button
        onClick={aoGravar}
        disabled={ocupado || r.duplicada}
        className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
      >
        {ocupado ? "a gravar…" : "Está certo — gravar"}
      </button>
    </div>
  );
}

function Campo({ label, ...resto }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-grey">{label}</span>
      <input
        {...resto}
        className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold-dark"
      />
    </label>
  );
}

function Seletor({ label, opcoes, ...resto }: {
  label: string; opcoes: string[];
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-grey">{label}</span>
      <select
        {...resto}
        className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold-dark"
      >
        {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
