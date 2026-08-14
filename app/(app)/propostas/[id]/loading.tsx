// Esqueleto da proposta (Configurador + editor) — instantâneo ao abrir.
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-3 w-28 rounded bg-line/50" />
      <div className="mt-3 h-9 w-72 rounded-lg bg-line/60" />
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="h-64 rounded-2xl bg-line/40" />
          <div className="h-40 rounded-2xl bg-line/30" />
        </div>
        <div className="space-y-3">
          <div className="h-48 rounded-2xl bg-line/40" />
          <div className="h-24 rounded-2xl bg-line/30" />
        </div>
      </div>
    </div>
  );
}
