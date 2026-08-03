// Esqueleto instantâneo da Sede — navegação sem espera em branco.
export default function Loading() {
  return (
    <div className="animate-pulse max-w-3xl">
      <div className="h-3 w-32 rounded bg-line/50" />
      <div className="mt-3 h-7 w-52 rounded-lg bg-line/60" />
      <div className="mt-6 h-40 rounded-2xl bg-line/40" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-line/30" />
        ))}
      </div>
    </div>
  );
}
