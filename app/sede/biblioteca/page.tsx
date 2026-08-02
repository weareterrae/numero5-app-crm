import { contextoSede } from "@/lib/sede/contexto";
import { criarClienteServico } from "@/lib/supabase/server";
import { uploadMaterialSede, removerMaterialSede } from "./acoes";

export const dynamic = "force-dynamic";

function tamanho(n: number | null | undefined) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function icone(tipo: string | null) {
  const t = tipo ?? "";
  if (t.startsWith("image/")) return "🖼️";
  if (t.startsWith("video/")) return "🎬";
  if (t.includes("pdf")) return "📄";
  if (t.startsWith("audio/")) return "🎵";
  return "📎";
}

export default async function SedeBiblioteca({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const ctx = await contextoSede();
  const { ok, erro } = await searchParams;

  if (!ctx.clienteId) {
    return (
      <div>
        <h1 className="font-display text-2xl font-extrabold">Biblioteca</h1>
        <p className="mt-4 rounded-xl border border-line bg-cream px-4 py-3 text-sm text-grey">
          Estamos a preparar o teu espaço. Muito em breve podes guardar aqui os teus materiais. 🖐️
        </p>
      </div>
    );
  }

  const svc = criarClienteServico();
  const { data: lista } = await svc
    .from("materiais_cliente")
    .select("id, nome, caminho, tipo, tamanho, criado_em")
    .eq("cliente_id", ctx.clienteId)
    .order("criado_em", { ascending: false });
  const materiais = await Promise.all(
    (lista ?? []).map(async (m) => {
      const { data } = await svc.storage.from("materiais").createSignedUrl(m.caminho, 3600);
      return { ...m, url: data?.signedUrl ?? null };
    }),
  );

  return (
    <div className="max-w-2xl">
      <div className="rotulo">a tua biblioteca</div>
      <h1 className="mt-1 font-display text-2xl font-extrabold">Os teus materiais</h1>
      <p className="mt-1 text-sm text-grey">
        Guarda aqui logótipos, fotos, vídeos e documentos — ficam num sítio só, e nós usamo-los na
        produção. Seguros e privados.
      </p>

      {ok ? (
        <p className="mt-4 rounded-xl border-2 border-good/40 bg-good/5 px-4 py-3 text-sm font-bold text-good">
          ✓ Carregado. Já ficámos com o teu material. 🖐️
        </p>
      ) : null}
      {erro ? (
        <p className="mt-4 rounded-xl border-2 border-bad/40 bg-bad/5 px-4 py-3 text-sm font-bold text-bad">
          {erro === "grande" ? "Esse ficheiro é grande demais (máx. 25 MB)." : "Não consegui carregar. Tenta outra vez."}
        </p>
      ) : null}

      <form action={uploadMaterialSede} className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-4">
        <input
          type="file"
          name="ficheiro"
          required
          className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-cream file:px-4 file:py-2 file:text-sm file:font-bold file:text-ink"
        />
        <button type="submit" className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-ink hover:brightness-105">
          Carregar 🖐️
        </button>
        <span className="w-full text-[11px] text-soft">Máx. 25 MB por ficheiro.</span>
      </form>

      <div className="mt-8">
        <div className="rotulo mb-3">guardados</div>
        {materiais.length === 0 ? (
          <p className="text-sm text-soft">Ainda não há materiais. Carrega o primeiro aí em cima. 🖐️</p>
        ) : (
          <ul className="space-y-2">
            {materiais.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
                <span className="text-xl">{icone(m.tipo)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{m.nome}</p>
                  <p className="text-[11px] text-soft">{tamanho(m.tamanho)}</p>
                </div>
                {m.url ? (
                  <a href={m.url} target="_blank" rel="noopener" className="text-sm font-bold text-gold-dark hover:underline">
                    abrir ↗
                  </a>
                ) : null}
                <form action={removerMaterialSede}>
                  <input type="hidden" name="id" value={m.id} />
                  <button type="submit" className="text-[12px] font-bold text-soft hover:text-bad">
                    remover
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
