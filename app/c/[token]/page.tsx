import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { criarClienteServico } from "@/lib/supabase/server";
import { FormCaptura } from "@/components/sede/FormCaptura";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Página pública de captação de leads do CLIENTE (white-label, sem Nº 5 à
 * vista). O cliente partilha este link (bio, QR, site) e cada contacto cai
 * direto nas Leads da Sede dele.
 */
export default async function PaginaCaptura({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const svc = criarClienteServico();

  const { data: org } = await svc
    .from("orgs")
    .select("id, nome, marca, ativo, captura_token")
    .eq("captura_token", token)
    .maybeSingle();
  if (!org || org.ativo === false) notFound();

  const marca = (org.marca && typeof org.marca === "object" ? org.marca : {}) as {
    cor?: string;
    logo_url?: string;
  };
  const cor = marca.cor || "#15181D";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        {marca.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={marca.logo_url} alt={org.nome} className="mx-auto h-16 w-auto max-w-[220px] object-contain" />
        ) : (
          <p className="font-display text-2xl font-extrabold" style={{ color: cor }}>
            {org.nome}
          </p>
        )}
        <p className="mt-3 text-sm text-grey">Deixa-nos o teu contacto — respondemos depressa.</p>
      </div>
      <FormCaptura token={token} cor={cor} />
    </main>
  );
}
