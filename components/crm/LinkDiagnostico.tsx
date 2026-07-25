"use client";

import { dataCurta } from "@/lib/dominio/metricas";
import { EnviarLink } from "./EnviarLink";

/**
 * O link que o cliente abre para preencher o diagnóstico dele.
 * Traz os botões de WhatsApp/email com o texto já preparado.
 */
export function LinkDiagnostico({
  token,
  submetidoEm,
  nome,
  telefone,
  email,
  clienteId,
  idioma = "pt",
}: {
  token: string | null;
  submetidoEm: string | null;
  nome: string;
  telefone?: string | null;
  email?: string | null;
  clienteId?: string | null;
  idioma?: "pt" | "en";
}) {
  if (!token) return null;

  const mensagem =
    idioma === "en"
      ? `Hi! 🖐️ This is Sandro, from Nº 5. Before we move ahead with ${nome}, I'd love to understand your business properly — and no one tells it better than you. I've put together a quick diagnostic (takes 3 minutes). Fill it in whenever you can, right here:`
      : `Boas! 🖐️ Aqui é o Sandro, do Nº 5. Antes de avançarmos com o ${nome}, gostava de perceber bem o teu negócio — e ninguém o conta melhor do que tu. Preparei-te um raio-x rápido (leva 3 minutos). Preenche quando puderes, é por aqui:`;
  const assunto = idioma === "en" ? "Your diagnostic — Nº 5" : "O teu diagnóstico — Nº 5";

  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <div className="mb-3">
        <h2 className="font-display text-lg font-extrabold">Diagnóstico do cliente</h2>
        {submetidoEm ? (
          <p className="text-sm text-good">
            ✓ Preenchido pelo cliente a {dataCurta(submetidoEm)}. Vê o diagnóstico abaixo.
          </p>
        ) : (
          <p className="text-sm text-grey">
            Envia este link ao cliente para ele contar o negócio dele por ti.
          </p>
        )}
      </div>

      <EnviarLink
        caminho={`/intake/${token}`}
        assunto={assunto}
        mensagem={mensagem}
        telefone={telefone}
        email={email}
        clienteId={clienteId}
      />

      {submetidoEm && (
        <p className="mt-2 text-xs text-soft">
          Já preenchido — só precisas de reenviar se quiseres que ele atualize os dados.
        </p>
      )}
    </section>
  );
}
