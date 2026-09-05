import Link from "next/link";
import { criarClienteServidor } from "@/lib/supabase/server";
import { dataCurta } from "@/lib/dominio/metricas";
import { criarDecisao, guardarRevisao } from "./acoes";

export const dynamic = "force-dynamic";

type Decisao = {
  id: string;
  cliente_id: string;
  plano_id: string | null;
  data_publicacao: string;
  canal: string;
  titulo: string;
  decisao: string;
  resultado_esperado: string | null;
  data_revisao: string;
  resultado: string | null;
  followup_data: string | null;
  estado: "aberta" | "revista" | "publicada" | "fechada";
  notas: string | null;
  clientes: { nome_marca: string } | { nome_marca: string }[] | null;
};

const ESTADO_ROTULO: Record<Decisao["estado"], string> = {
  aberta: "aberta",
  revista: "revista, por publicar",
  publicada: "follow-up publicado",
  fechada: "fechada",
};

export default async function DecisoesPage() {
  const supabase = await criarClienteServidor();
  const [decisoesRes, clientesRes] = await Promise.all([
    supabase
      .from("decisoes_publicadas")
      .select(
        "id, cliente_id, plano_id, data_publicacao, canal, titulo, decisao, resultado_esperado, data_revisao, resultado, followup_data, estado, notas, clientes(nome_marca)",
      )
      .order("data_revisao", { ascending: true }),
    supabase.from("clientes").select("id, nome_marca").order("nome_marca"),
  ]);

  const todas = (decisoesRes.data ?? []) as unknown as Decisao[];
  const clientes = (clientesRes.data ?? []) as { id: string; nome_marca: string }[];
  const nomeDe = (c: Decisao["clientes"]) =>
    (Array.isArray(c) ? c[0]?.nome_marca : c?.nome_marca) ?? "Cliente";

  const { hoje, em30 } = limites();
  const aRever = todas.filter((d) => d.estado === "aberta" && d.data_revisao <= em30);
  const abertas = todas.filter((d) => d.estado === "aberta" && d.data_revisao > em30);
  const feitas = todas.filter((d) => d.estado !== "aberta");

  return (
    <div className="space-y-6">
      <div>
        <p className="rotulo">prestar contas</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Decisões publicadas</h1>
        <p className="mt-1 max-w-2xl text-sm text-grey">
          Cada decisão publicada tem data para voltar. Quando chega, escreve-se o que deu, marca-se
          como revista, e o follow-up entra no plano do mês seguinte. Não é uma rubrica pública: é
          memória.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Kpi valor={String(aRever.length)} rotulo="a rever até 30 dias" destaque={aRever.length > 0} />
        <Kpi valor={String(abertas.length)} rotulo="abertas, com data" />
        <Kpi valor={String(feitas.length)} rotulo="revistas ou publicadas" />
      </section>

      <Bloco titulo="A rever" sub="Já passaram da data ou chegam lá em 30 dias. O Nº 5 vai buscar o resultado e escreve-o aqui." lista={aRever} vazio="Nada a rever nos próximos 30 dias." nomeDe={nomeDe} hoje={hoje} />
      <Bloco titulo="Abertas" sub="Publicadas, à espera da data de revisão." lista={abertas} vazio="Sem decisões abertas." nomeDe={nomeDe} hoje={hoje} />
      <Bloco titulo="Revistas e publicadas" sub="O que já prestou contas." lista={feitas} vazio="Ainda nenhuma." nomeDe={nomeDe} hoje={hoje} />

      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-display text-lg font-extrabold">Registar uma decisão publicada</h2>
        <p className="mt-0.5 text-xs text-grey">
          Sempre que sai um post do tipo &quot;Uma decisão&quot; ou &quot;A conta&quot;. A revisão fica a 3 meses por
          defeito; muda para 6 quando o resultado demora.
        </p>
        <form action={criarDecisao} className="mt-3 grid gap-2 sm:grid-cols-2">
          <select name="cliente_id" required className="rounded-lg border border-line bg-cream px-2.5 py-2 text-sm">
            <option value="">cliente ou marca</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome_marca}
              </option>
            ))}
          </select>
          <input name="data_publicacao" type="date" required className="rounded-lg border border-line px-2.5 py-2 text-sm outline-none focus:border-gold" />
          <input name="titulo" required placeholder="título do post" className="rounded-lg border border-line px-2.5 py-2 text-sm outline-none focus:border-gold sm:col-span-2" />
          <textarea name="decisao" required rows={2} placeholder="a decisão, numa frase" className="rounded-lg border border-line px-2.5 py-2 text-sm outline-none focus:border-gold sm:col-span-2" />
          <input name="resultado_esperado" placeholder="o que se espera ver na revisão (opcional)" className="rounded-lg border border-line px-2.5 py-2 text-sm outline-none focus:border-gold sm:col-span-2" />
          <select name="meses" className="rounded-lg border border-line bg-cream px-2.5 py-2 text-sm">
            <option value="3">rever a 3 meses</option>
            <option value="6">rever a 6 meses</option>
          </select>
          <input name="data_revisao" type="date" className="rounded-lg border border-line px-2.5 py-2 text-sm outline-none focus:border-gold" title="ou uma data concreta" />
          <div className="sm:col-span-2">
            <button className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-cream hover:brightness-110">
              Registar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

/** Datas de corte: hoje e daqui a 30 dias (fora do render, para a regra de pureza). */
function limites() {
  const agora = new Date();
  const hoje = agora.toISOString().slice(0, 10);
  const em30 = new Date(agora.getTime() + 30 * 864e5).toISOString().slice(0, 10);
  return { hoje, em30 };
}

function Kpi({ valor, rotulo, destaque }: { valor: string; rotulo: string; destaque?: boolean }) {
  return (
    <div className={`rounded-xl p-5 ${destaque ? "bg-ink text-cream" : "border border-line bg-white"}`}>
      <div className={`font-display text-3xl font-extrabold tabular-nums ${destaque ? "text-gold" : ""}`}>{valor}</div>
      <div className={`mt-1 text-[13px] ${destaque ? "text-soft" : "text-grey"}`}>{rotulo}</div>
    </div>
  );
}

function Bloco({
  titulo,
  sub,
  lista,
  vazio,
  nomeDe,
  hoje,
}: {
  titulo: string;
  sub: string;
  lista: Decisao[];
  vazio: string;
  nomeDe: (c: Decisao["clientes"]) => string;
  hoje: string;
}) {
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="font-display text-lg font-extrabold">{titulo}</h2>
      <p className="mb-3 text-xs text-soft">{sub}</p>
      {lista.length === 0 ? (
        <p className="text-sm text-grey">{vazio}</p>
      ) : (
        <div className="divide-y divide-line/60">
          {lista.map((d) => (
            <details key={d.id} className="group py-3">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold">{d.titulo}</p>
                  <p className="text-xs text-grey">
                    {nomeDe(d.clientes)} · publicada {dataCurta(d.data_publicacao)} · {d.canal}
                  </p>
                  <p className="mt-1 text-sm text-grey">{d.decisao}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`font-mono text-sm ${d.estado === "aberta" && d.data_revisao <= hoje ? "font-bold text-ink" : "text-grey"}`}>
                    rever {dataCurta(d.data_revisao)}
                  </p>
                  <p className="text-[11px] text-soft">{ESTADO_ROTULO[d.estado]}</p>
                  {d.plano_id && (
                    <Link href={`/clientes/${d.cliente_id}/planos/${d.plano_id}`} className="text-[11px] font-bold text-gold-dark">
                      ver plano
                    </Link>
                  )}
                </div>
              </summary>
              <form action={guardarRevisao} className="mt-3 grid gap-2 rounded-lg bg-cream/60 p-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={d.id} />
                {d.resultado_esperado && (
                  <p className="text-xs text-grey sm:col-span-2">Esperava-se: {d.resultado_esperado}</p>
                )}
                <textarea
                  name="resultado"
                  rows={3}
                  defaultValue={d.resultado ?? ""}
                  placeholder="o que deu, com números e data"
                  className="rounded-lg border border-line bg-white px-2.5 py-2 text-sm outline-none focus:border-gold sm:col-span-2"
                />
                <select name="estado" defaultValue={d.estado} className="rounded-lg border border-line bg-white px-2.5 py-2 text-sm">
                  <option value="aberta">aberta</option>
                  <option value="revista">revista, por publicar</option>
                  <option value="publicada">follow-up publicado</option>
                  <option value="fechada">fechada, sem follow-up</option>
                </select>
                <label className="flex items-center gap-2 text-xs text-grey">
                  rever a
                  <input name="data_revisao" type="date" defaultValue={d.data_revisao} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gold" />
                </label>
                <label className="flex items-center gap-2 text-xs text-grey">
                  follow-up publicado a
                  <input name="followup_data" type="date" defaultValue={d.followup_data ?? ""} className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-gold" />
                </label>
                <input
                  name="notas"
                  defaultValue={d.notas ?? ""}
                  placeholder="notas: onde se vai buscar o resultado"
                  className="rounded-lg border border-line bg-white px-2.5 py-2 text-sm outline-none focus:border-gold"
                />
                <div className="sm:col-span-2">
                  <button className="rounded-full bg-ink px-4 py-1.5 text-sm font-bold text-cream hover:brightness-110">
                    Guardar
                  </button>
                </div>
              </form>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
