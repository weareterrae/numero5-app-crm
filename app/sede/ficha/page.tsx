import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServico } from "@/lib/supabase/server";
import { guardarFichaSede, adicionarResponsavelSede, removerResponsavelSede } from "./acoes";

export const dynamic = "force-dynamic";

function Campo({
  label,
  name,
  valor,
  dica,
  ph,
  tipo = "text",
}: {
  label: string;
  name: string;
  valor?: string | null;
  dica?: string;
  ph?: string;
  tipo?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-soft">{label}</span>
      <input
        name={name}
        type={tipo}
        defaultValue={valor ?? ""}
        placeholder={ph}
        className="w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm outline-none focus:border-gold"
      />
      {dica ? <span className="mt-1 block text-[11px] text-soft">{dica}</span> : null}
    </label>
  );
}

const inp = "w-full rounded-lg border border-line bg-cream px-3 py-2 text-sm outline-none focus:border-gold";

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
  const cid = ctx.clienteId;

  const { data: cliente } = await svc
    .from("clientes")
    .select("nome_marca, setor, website, redes")
    .eq("id", cid)
    .maybeSingle();

  // fiscais (0018) — leitura tolerante
  let fiscais: Record<string, string | null> = {};
  const { data: f } = await svc
    .from("clientes")
    .select("empresa_fiscal, nif, morada, codigo_postal, localidade")
    .eq("id", cid)
    .maybeSingle();
  if (f) fiscais = f as Record<string, string | null>;

  // kit de marca (0020) — tolerante
  let kit: Record<string, string | null> = {};
  const { data: k } = await svc
    .from("clientes")
    .select("kit_logo, kit_cores, kit_fontes, kit_notas")
    .eq("id", cid)
    .maybeSingle();
  if (k) kit = k as Record<string, string | null>;

  // briefing vivo (0052) — tolerante
  let brief: Record<string, string | null> = {};
  const { data: b } = await svc.from("clientes").select("brief_sede").eq("id", cid).maybeSingle();
  if (b?.brief_sede && typeof b.brief_sede === "object" && !Array.isArray(b.brief_sede)) {
    brief = b.brief_sede as Record<string, string | null>;
  }

  const { data: contactos } = await svc
    .from("contactos")
    .select("id, nome, cargo, email, telefone")
    .eq("cliente_id", cid)
    .order("nome", { ascending: true });

  const redes =
    cliente?.redes && typeof cliente.redes === "object" && !Array.isArray(cliente.redes)
      ? (cliente.redes as Record<string, string>)
      : {};

  return (
    <div className="max-w-3xl">
      <div className="rotulo">a tua ficha viva</div>
      <h1 className="mt-1 font-display text-2xl font-extrabold">{cliente?.nome_marca || "A minha ficha"}</h1>
      <p className="mt-1 max-w-xl text-sm text-grey">
        Mantém aqui a informação da tua empresa sempre atualizada. O que mudas chega-nos <b>na hora</b> —
        e afina tudo o que produzimos para ti.
      </p>

      {guardado ? (
        <p className="mt-4 rounded-xl border-2 border-good/40 bg-good/5 px-4 py-3 text-sm font-bold text-good">
          ✓ Guardado. Já ficámos com a informação atualizada. Obrigado! 🖐️
        </p>
      ) : null}

      <div className="mt-4 rounded-xl border border-line bg-white px-4 py-3">
        <div className="rotulo">a tua página de links</div>
        <p className="mt-1 text-sm">
          <a
            href={`https://app.numerocinco.pt/l/${ctx.org.slug}`}
            target="_blank"
            rel="noopener"
            className="font-bold text-gold-dark hover:underline"
          >
            app.numerocinco.pt/l/{ctx.org.slug} ↗
          </a>
        </p>
        <p className="mt-0.5 text-[11px] text-soft">
          Uma página só com os teus links — perfeita para a bio do Instagram. Atualiza-se com o website
          e as redes desta ficha.
        </p>
      </div>

      {/* ---- Dados da empresa + redes + recado ---- */}
      <form action={guardarFichaSede} className="mt-6 grid gap-6">
        <section className="rounded-xl border border-line bg-white p-5">
          <p className="mb-4 text-[11px] font-bold uppercase tracking-wide text-gold-dark">Dados da empresa</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Nome / marca" name="nome_marca" valor={cliente?.nome_marca} ph="Nome da empresa" />
            <Campo label="Setor" name="setor" valor={cliente?.setor} ph="ex.: educação, restauração…" />
            <Campo label="Razão social (nome fiscal)" name="empresa_fiscal" valor={fiscais.empresa_fiscal} ph="Nome completo da entidade" />
            <Campo label="NIF" name="nif" valor={fiscais.nif} ph="Número de contribuinte" />
            <Campo label="Website" name="website" valor={cliente?.website} ph="https://…" />
            <div />
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-soft">Morada</span>
              <input name="morada" defaultValue={fiscais.morada ?? ""} placeholder="Rua, número, andar" className={inp} />
            </label>
            <Campo label="Código postal" name="codigo_postal" valor={fiscais.codigo_postal} ph="0000-000" />
            <Campo label="Localidade" name="localidade" valor={fiscais.localidade} ph="Cidade" />
          </div>
        </section>

        <section className="rounded-xl border border-line bg-white p-5">
          <p className="mb-4 text-[11px] font-bold uppercase tracking-wide text-gold-dark">Kit de marca</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Logótipo (URL)" name="kit_logo" valor={kit.kit_logo} ph="link para o teu logótipo" />
            <Campo label="Cores da marca" name="kit_cores" valor={kit.kit_cores} ph="ex.: #E8A13C, #15181D" />
            <Campo label="Fontes" name="kit_fontes" valor={kit.kit_fontes} ph="ex.: Archivo, Bricolage" />
            <div />
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-soft">Notas da marca</span>
              <textarea name="kit_notas" rows={2} defaultValue={kit.kit_notas ?? ""} placeholder="O que é importante saber sobre a tua marca." className={inp} />
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-white p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gold-dark">O teu negócio</p>
          <p className="mb-4 mt-0.5 text-[13px] text-grey">
            Quanto mais nos contares, mais afinado sai tudo o que produzimos — e melhor treinamos a
            IA para ti.
          </p>
          <div className="grid gap-4">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-soft">Público-alvo</span>
              <textarea name="publico_alvo" rows={2} defaultValue={brief.publico_alvo ?? ""} placeholder="Quem queres alcançar? (idade, zona, perfil…)" className={inp} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-soft">Ofertas / serviços em destaque</span>
              <textarea name="ofertas" rows={2} defaultValue={brief.ofertas ?? ""} placeholder="O que queres empurrar neste período." className={inp} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-soft">Épocas / datas-chave</span>
              <textarea name="epocas" rows={2} defaultValue={brief.epocas ?? ""} placeholder="ex.: Open Day 12 set; início do ano letivo; Natal." className={inp} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-soft">O que nunca dizer</span>
              <textarea name="nunca_dizer" rows={2} defaultValue={brief.nunca_dizer ?? ""} placeholder="Palavras, promessas ou temas a evitar." className={inp} />
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-white p-5">
          <p className="mb-4 text-[11px] font-bold uppercase tracking-wide text-gold-dark">Redes sociais</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Instagram" name="instagram" valor={redes.instagram} ph="@a-tua-marca" />
            <Campo label="Facebook" name="facebook" valor={redes.facebook} ph="/atuamarca" />
            <Campo label="LinkedIn" name="linkedin" valor={redes.linkedin} ph="/company/…" />
            <Campo label="TikTok" name="tiktok" valor={redes.tiktok} ph="@a-tua-marca" />
          </div>
        </section>

        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-soft">
            Um recado para a equipa (opcional)
          </span>
          <textarea
            name="recado"
            rows={3}
            placeholder="Ex.: temos uma campanha nova a começar dia 15; foquem aí o próximo mês."
            className={inp}
          />
        </label>

        <div>
          <button type="submit" className="rounded-full bg-gold px-6 py-2.5 font-bold text-ink transition hover:brightness-105">
            Guardar 🖐️
          </button>
        </div>
      </form>

      {/* ---- Responsáveis (contactos) — formulários próprios ---- */}
      <section className="mt-8 rounded-xl border border-line bg-white p-5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gold-dark">Responsáveis</p>
        <p className="mb-4 mt-0.5 text-[13px] text-grey">Quem devemos contactar, e para quê.</p>

        {contactos && contactos.length ? (
          <ul className="mb-4 divide-y divide-line/70">
            {contactos.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1">
                  <p className="text-sm font-bold">
                    {c.nome}
                    {c.cargo ? <span className="font-normal text-grey"> · {c.cargo}</span> : null}
                  </p>
                  <p className="text-[12px] text-soft">
                    {[c.email, c.telefone].filter(Boolean).join(" · ") || "sem contacto"}
                  </p>
                </div>
                <form action={removerResponsavelSede}>
                  <input type="hidden" name="contacto_id" value={c.id} />
                  <button className="text-[12px] font-bold text-soft hover:text-bad" type="submit">
                    remover
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-soft">Ainda não há responsáveis. Adiciona o primeiro. 🖐️</p>
        )}

        <form action={adicionarResponsavelSede} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-soft">Nome *</span>
            <input name="nome" required className={inp} placeholder="Nome do responsável" />
          </label>
          <Campo label="Cargo" name="cargo" ph="ex.: gerente, marketing…" />
          <Campo label="Email" name="email" tipo="email" ph="nome@empresa.pt" />
          <Campo label="Telefone" name="telefone" ph="+351 …" />
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-full border border-line px-5 py-2 text-sm font-bold text-ink hover:bg-cream">
              + Adicionar responsável
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
