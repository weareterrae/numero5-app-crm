import Link from "next/link";
import { Simbolo } from "@/components/marca/Simbolo";

export default function NaoEncontrado() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6 text-ink">
      <div className="max-w-md text-center">
        <Simbolo fundo="claro" className="mx-auto mb-8 h-auto w-24" titulo="Nº 5" />
        <p className="mb-2 font-mono text-sm tracking-widest text-gold-dark">404</p>
        <h1 className="mb-3 font-display text-3xl">Página não encontrada.</h1>
        <p className="mb-8 text-grey">Esta página não existe ou foi movida.</p>
        <Link
          href="/"
          className="inline-flex items-center rounded-lg bg-gold px-5 py-2.5 font-medium text-ink transition hover:opacity-90"
        >
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
