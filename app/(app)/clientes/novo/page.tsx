import Link from "next/link";
import { criarCliente } from "../acoes";
import { ORIGENS, REDES } from "@/lib/db/clientes";
import { ESTADOS, ESTADO_LABEL, type Estado } from "@/lib/dominio/funil";

export default function NovoCliente() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <p className="rotulo">mais um para a contagem</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Novo cliente</h1>
      </div>

      <form action={criarCliente} className="space-y-5">
        <div className="rounded-xl border border-line bg-white p-5">
          <Campo id="nome_marca" label="Nome da marca *" required autoFocus />
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo id="setor" label="Setor" placeholder="restauração, imobiliário…" />
            <Campo id="website" label="Website" type="url" placeholder="https://" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Seletor id="origem" label="Origem do lead" opcoes={ORIGENS.map(([v, t]) => [v, t])} />
            <Seletor
              id="estado"
              label="Estado"
              opcoes={ESTADOS.map((e) => [e, ESTADO_LABEL[e as Estado]])}
            />
            <Campo id="valor_estimado" label="Valor estimado (€)" type="number" />
          </div>
        </div>

        <div className="rounded-xl border border-line bg-white p-5">
          <p className="mb-1 text-sm font-bold">Redes sociais</p>
          <p className="mb-3 text-xs text-soft">Deixa em branco o que não existir.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {REDES.filter(([k]) => k !== "site").map(([chave, nome]) => (
              <Campo key={chave} id={`rede_${chave}`} label={nome} placeholder="@handle ou link" />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-white p-5">
          <label htmlFor="notas_gerais" className="mb-1.5 block text-xs font-bold text-grey">
            Notas
          </label>
          <textarea
            id="notas_gerais"
            name="notas_gerais"
            rows={3}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
            placeholder="O que já sabes deste negócio…"
          />
        </div>

        <div className="flex gap-3">
          <button className="rounded-full bg-gold px-6 py-2.5 font-bold text-ink">Criar 🖐️</button>
          <Link
            href="/clientes"
            className="rounded-full px-5 py-2.5 text-sm font-bold text-grey hover:text-ink"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}

function Campo({
  id,
  label,
  ...props
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold text-grey">
        {label}
      </label>
      <input
        id={id}
        name={id}
        className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-gold"
        {...props}
      />
    </div>
  );
}

function Seletor({
  id,
  label,
  opcoes,
}: {
  id: string;
  label: string;
  opcoes: [string, string][];
}) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold text-grey">
        {label}
      </label>
      <select
        id={id}
        name={id}
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-gold"
      >
        {id === "origem" && <option value="">—</option>}
        {opcoes.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}
