// Esqueleto instantâneo do operador — aparece de imediato ao navegar,
// enquanto o conteúdo real da página é carregado no servidor.
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-3 w-40 rounded bg-line/50" />
      <div className="mt-3 h-8 w-56 rounded-lg bg-line/60" />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-line/40" />
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-line/30" />
        ))}
      </div>
    </div>
  );
}
