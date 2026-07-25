import { type DiferencasDiagnostico, temDiferencas } from "@/lib/dominio/intake";

export function DiffDiagnostico({
  versaoAtual,
  diferencas,
}: {
  versaoAtual: number;
  diferencas: DiferencasDiagnostico;
}) {
  if (!temDiferencas(diferencas)) return null;

  return (
    <section className="rounded-xl border border-cobalt/25 bg-cobalt/[0.03] p-5">
      <p className="rotulo !text-cobalt">o que mudou face à v{versaoAtual - 1}</p>
      <div className="mt-2 space-y-2 text-sm">
        {diferencas.alteradas.map((m, i) => (
          <p key={`a${i}`}>
            <b>{m.campo}:</b> <span className="text-soft line-through">{m.de}</span> →{" "}
            <span className="font-bold text-cobalt">{m.para}</span>
          </p>
        ))}
        {diferencas.novas.map((m, i) => (
          <p key={`n${i}`}>
            <span className="text-good">+ </span>
            <b>{m.campo}:</b> {m.para}
          </p>
        ))}
        {diferencas.removidas.map((m, i) => (
          <p key={`r${i}`}>
            <span className="text-bad">− </span>
            <b>{m.campo}:</b> <span className="text-soft line-through">{m.de}</span>
          </p>
        ))}
      </div>
    </section>
  );
}
