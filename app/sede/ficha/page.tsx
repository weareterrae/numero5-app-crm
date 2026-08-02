import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServico } from "@/lib/supabase/server";
import { guardarFichaSede } from "./acoes";

export const dynamic = "force-dynamic";

function Campo({
  label,
  name,
  valor,
  dica,
  ph,
}: {
  label: string;
  name: string;
  valor?: string;
  dica?: string;
  ph?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-soft">{label}</span>
      <input
        name={name}
        defaultValue={valor ?? ""}
        placeholder={ph}
        className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm outline-none focus:border-gold"
      />
      {dica ? <span className="mt-1 block text-[11px] text-soft">{dica}</span> : null}
    </label>
  );
}

export default async function SedeFicha({
  searchParams,
}: {
  searchParams: Promise<{ guardado?: string }>;
}) {
  const ctx = await contextoSede();
  const { guardado } = await searchParams;

  if (!ctx.clienteId) {
    return (
      <div>
        <h1 className="font-display text-2xl font-extrabold">A minha ficha</h1>
        <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Estamos a preparar o teu espaço. Muito em breve podes manter aqui a tua informação sempre
          atualizada. 🖐️
        </p>
      </div>
    );
  }

  const svc = criarClienteServico();
  const { data: cliente } = await svc
    .from("clientes")
    .select("nome_marca, setor, website, redes")
    .eq("id", ctx.clienteId)
    .maybeSingle();

  const redes =
    cliente?.redes && typeof cliente.redes === "object" && !Array.isArray(cliente.redes)
      ? (cliente.redes as Record<string, string>)
      : {};

  return (
    <div>
      <div className="rotulo">a tua ficha viva</div>
      <h1 className="mt-1 font-display text-2xl font-extrabold">{cliente?.nome_marca || "A minha ficha"}</h1>
      <p className="mt-1 max-w-xl text-sm text-grey">
        Mantém aqui a tua informação atualizada. O que mudas chega-nos <b>na hora</b> — e afina tudo
        o que produzimos para ti.
      </p>

      {guardado ? (
        <p className="mt-4 rounded-xl border-2 border-good/40 bg-good/5 px-4 py-3 text-sm font-bold text-good">
          ✓ Guardado. Já ficámos com a informação atualizada. Obrigado! 🖐️
        </p>
      ) : null}

      <form action={guardarFichaSede} className="mt-6 grid max-w-2xl gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Setor" name="setor" valor={cliente?.setor ?? ""} ph="ex.: restauração, imobiliário…" />
          <Campo label="Website" name="website" valor={cliente?.website ?? ""} ph="https://…" />
        </div>

        <div className="rounded-xl border border-line bg-white p-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gold-dark">Redes sociais</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Instagram" name="instagram" valor={redes.instagram} ph="@a-tua-marca" />
            <Campo label="Facebook" name="facebook" valor={redes.facebook} ph="/atuamarca" />
            <Campo label="LinkedIn" name="linkedin" valor={redes.linkedin} ph="/company/…" />
            <Campo label="TikTok" name="tiktok" valor={redes.tiktok} ph="@a-tua-marca" />
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-soft">
            Um recado para a equipa (opcional)
          </span>
          <textarea
            name="recado"
            rows={3}
            placeholder="Ex.: temos uma promoção nova a começar dia 15; foquem aí o próximo mês."
            className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm outline-none focus:border-gold"
          />
        </label>

        <div>
          <button
            type="submit"
            className="rounded-full bg-gold px-6 py-2.5 font-bold text-ink transition hover:brightness-105"
          >
            Guardar 🖐️
          </button>
        </div>
      </form>
    </div>
  );
}
