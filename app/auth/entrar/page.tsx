import { Simbolo } from "@/components/marca/Simbolo";
import { confirmarEntrada } from "./acoes";

export const dynamic = "force-dynamic";

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; proximo?: string; erro?: string }>;
}) {
  const { token_hash, type, proximo, erro } = await searchParams;

  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-sm text-center">
        <Simbolo className="mx-auto mb-6 w-20" titulo="Nº 5" />

        {erro || !token_hash ? (
          <>
            <h1 className="font-display text-2xl font-extrabold">Este link já foi usado ou expirou</h1>
            <p className="mt-2 text-sm text-grey">
              Por segurança, cada link serve uma vez. Pede um novo — é rápido.
            </p>
            <a
              href="/login"
              className="mt-6 inline-block rounded-full bg-gold px-6 py-3 font-bold text-ink hover:brightness-105"
            >
              Receber um novo link →
            </a>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-extrabold">Estás quase na tua Sede 🖐️</h1>
            <p className="mt-2 text-sm text-grey">
              Carrega no botão para entrares em segurança.
            </p>
            <form action={confirmarEntrada} className="mt-6">
              <input type="hidden" name="token_hash" value={token_hash} />
              <input type="hidden" name="type" value={type ?? "magiclink"} />
              <input type="hidden" name="proximo" value={proximo ?? "/sede"} />
              <button
                type="submit"
                className="w-full rounded-full bg-gold px-6 py-3 font-bold text-ink transition hover:brightness-105"
              >
                Entrar na minha Sede →
              </button>
            </form>
            <p className="mt-3 text-xs text-soft">
              Sem palavras-passe. Este passo protege a tua conta.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
