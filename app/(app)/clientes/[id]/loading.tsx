// Esqueleto da ficha do cliente — aparece de imediato ao abrir, enquanto os
// dados (agora carregados em paralelo) chegam do servidor.
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-3 w-24 rounded bg-line/50" />
      <div className="mt-3 flex items-center gap-3">
        <div className="h-9 w-64 rounded-lg bg-line/60" />
        <div className="h-6 w-20 rounded-full bg-line/40" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="h-40 rounded-2xl bg-line/40" />
          <div className="h-56 rounded-2xl bg-line/30" />
        </div>
        <div className="space-y-3">
          <div className="h-28 rounded-2xl bg-line/40" />
          <div className="h-28 rounded-2xl bg-line/30" />
          <div className="h-40 rounded-2xl bg-line/30" />
        </div>
      </div>
    </div>
  );
}
