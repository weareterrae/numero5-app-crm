import { checklistRevisao, podePartilhar } from "@/lib/ia/prompts/validar-proposta";

export function ChecklistRevisao({
  conteudo,
  temValores,
  temValidade,
  idiomaCliente,
}: {
  conteudo: unknown;
  temValores: boolean;
  temValidade: boolean;
  idiomaCliente: "pt" | "en";
}) {
  // Sem conteúdo da IA ainda, não há nada a rever.
  if (!conteudo || typeof conteudo !== "object" || Object.keys(conteudo).length === 0) return null;

  const itens = checklistRevisao(conteudo, { temValores, temValidade, idiomaCliente });
  const pronto = podePartilhar(itens);

  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold">Revisão antes de partilhar</h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            pronto ? "bg-good/15 text-good" : "bg-bad/15 text-bad"
          }`}
        >
          {pronto ? "pronta a partilhar" : "rever primeiro"}
        </span>
      </div>
      <p className="mb-3 text-xs text-soft">
        A IA nunca envia sozinha. Confirma tu antes de o cliente ver.
      </p>
      <ul className="space-y-1.5 text-sm">
        {itens.map((i, k) => (
          <li key={k} className="flex items-start gap-2">
            <span className={i.ok ? "text-good" : i.critico ? "text-bad" : "text-warn"}>
              {i.ok ? "✓" : i.critico ? "✗" : "!"}
            </span>
            <span className={i.ok ? "text-grey" : "font-bold"}>{i.item}</span>
          </li>
        ))}
      </ul>
      {!pronto && (
        <p className="mt-3 rounded-lg border-2 border-bad bg-bad/10 p-2.5 text-xs font-bold text-bad">
          Há pontos críticos por resolver. Corrige-os antes de partilhar (ou avança em consciência).
        </p>
      )}
    </section>
  );
}
