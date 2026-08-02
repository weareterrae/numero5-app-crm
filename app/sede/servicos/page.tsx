import { contextoSede } from "@/lib/sede/contexto";
import { pedirServicoSede } from "./acoes";

export const dynamic = "force-dynamic";

const SERVICOS: { chave: string; icone: string; titulo: string; texto: string }[] = [
  { chave: "conteudo", icone: "📸", titulo: "Mais conteúdo", texto: "Posts, carrosséis, reels e histórias, com constância." },
  { chave: "anuncios", icone: "🎯", titulo: "Anúncios", texto: "Campanhas no Instagram, Facebook e Google, com acompanhamento." },
  { chave: "site", icone: "🌐", titulo: "Site ou loja online", texto: "Criar de novo, melhorar o que tens, ou vender online." },
  { chave: "assistente", icone: "💬", titulo: "Assistente no site", texto: "Responde e apanha contactos a qualquer hora, com a tua voz." },
  { chave: "crm_portal", icone: "🗂️", titulo: "CRM / portal", texto: "Organizar as tuas leads e não perder nenhum contacto — como este espaço." },
  { chave: "email", icone: "✉️", titulo: "Email marketing", texto: "Newsletters e campanhas para a tua base de contactos." },
  { chave: "foto", icone: "🎥", titulo: "Fotografia e vídeo", texto: "Captação profissional da tua marca, no teu espaço." },
  { chave: "imagem", icone: "✨", titulo: "Renovar a imagem", texto: "Logótipo, identidade e estratégia, de fio a pavio." },
];

export default async function SedeServicos({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  await contextoSede();
  const { ok } = await searchParams;

  return (
    <div className="max-w-2xl">
      <div className="rotulo">queres crescer?</div>
      <h1 className="mt-1 font-display text-2xl font-extrabold">O que precisas a seguir?</h1>
      <p className="mt-1 text-sm text-grey">
        Escolhe o que te interessa e conta-nos o que tens em mente. Analisamos e voltamos com uma
        proposta à tua medida — sem compromisso. 🖐️
      </p>

      {ok ? (
        <p className="mt-5 rounded-xl border-2 border-good/40 bg-good/5 px-4 py-3 text-sm font-bold text-good">
          ✓ Recebido! Vamos analisar e voltar com uma proposta. Podes acompanhar em «Pedidos».
        </p>
      ) : null}

      <form action={pedirServicoSede} className="mt-6 space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {SERVICOS.map((s) => (
            <label
              key={s.chave}
              className="group flex cursor-pointer gap-3 rounded-xl border border-line bg-white p-4 transition hover:border-gold/50 has-[:checked]:border-gold has-[:checked]:bg-gold/5"
            >
              <input type="checkbox" name="interesse" value={s.chave} className="mt-1 accent-gold" />
              <span>
                <span className="flex items-center gap-2 font-bold">
                  <span className="text-lg">{s.icone}</span>
                  {s.titulo}
                </span>
                <span className="mt-0.5 block text-sm text-grey">{s.texto}</span>
              </span>
            </label>
          ))}
        </div>

        <div>
          <label htmlFor="nota" className="rotulo">
            o que tens em mente
          </label>
          <textarea
            id="nota"
            name="nota"
            rows={4}
            placeholder="Ex.: quero começar a fazer anúncios e preciso de mais conteúdo para o Instagram…"
            className="mt-1 w-full rounded-xl border border-line bg-white p-3 text-sm"
          />
        </div>

        <button
          type="submit"
          className="rounded-full bg-gold px-6 py-2.5 text-sm font-bold text-ink hover:brightness-105"
        >
          Pedir proposta 🖐️
        </button>
      </form>
    </div>
  );
}
