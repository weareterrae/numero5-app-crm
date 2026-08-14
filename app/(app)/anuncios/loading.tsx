/** Estado de carregamento de /anuncios — a página fala com a API do Meta no
 *  servidor (várias contas), por isso a navegação mostra logo isto em vez de
 *  parecer que a app congelou. */
export default function Loading() {
  return (
    <div>
      <p className="rotulo">todas as contas, num sítio · últimos 30 dias</p>
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Anúncios</h1>
      <div className="mt-6 space-y-3">
        <div className="h-24 animate-pulse rounded-xl bg-ink/10" />
        <div className="h-40 animate-pulse rounded-xl border border-line bg-white" />
        <div className="h-40 animate-pulse rounded-xl border border-line bg-white" />
      </div>
      <p className="mt-4 text-sm text-grey">A ler as contas Meta…</p>
    </div>
  );
}
