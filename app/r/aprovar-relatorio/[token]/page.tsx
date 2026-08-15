import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { criarClienteServico } from "@/lib/supabase/server";
import { Simbolo } from "@/components/marca/Simbolo";
import { mesLegivel } from "@/lib/dominio/producao";
import { dataCurta } from "@/lib/dominio/metricas";
import { idiomaDe } from "@/lib/dominio/intake";
import { emailOperador } from "@/lib/email/relatorios";
import { ConfirmarEnvio } from "./ConfirmarEnvio";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AprovarRelatorio({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = criarClienteServico();

  const { data: rel } = await supabase
    .from("relatorios")
    .select("id, cliente_id, mes, email_html, aprovado_em, email_cliente, clientes(nome_marca, idioma)")
    .eq("aprovar_token", token)
    .maybeSingle();
  if (!rel) notFound();

  const cliente = (Array.isArray(rel.clientes) ? rel.clientes[0] : rel.clientes) as
    | { nome_marca: string; idioma?: string | null }
    | null;
  const nomeMarca = cliente?.nome_marca ?? "Cliente";
  const idioma = idiomaDe(cliente?.idioma);
  const mesLabel = mesLegivel(rel.mes, idioma);

  const { data: contacto } = await supabase
    .from("contactos")
    .select("email")
    .eq("cliente_id", rel.cliente_id)
    .order("principal", { ascending: false })
    .limit(1)
    .maybeSingle();

  const copia = emailOperador();
  const destino = contacto?.email?.trim() || copia;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <header className="rounded-2xl bg-ink px-8 py-8 text-cream">
        <Simbolo fundo="escuro" className="mb-4 w-14" titulo="Nº 5" />
        <p className="rotulo !text-gold">aprovação · relatório mensal</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight">
          {nomeMarca} · {mesLabel}
        </h1>
      </header>

      {rel.aprovado_em ? (
        <section className="mt-6 rounded-2xl border border-good bg-good/10 p-6 text-center">
          <p className="font-display text-xl font-extrabold text-ink">Já foi enviado ✓</p>
          <p className="mt-1 text-sm text-grey">
            Enviado a {dataCurta(rel.aprovado_em)}
            {rel.email_cliente ? ` para ${rel.email_cliente}` : ""}.
          </p>
        </section>
      ) : (
        <>
          <section className="mt-6 rounded-2xl border border-line bg-white p-5">
            <p className="rotulo !text-cobalt">pré-visualização</p>
            <p className="mt-1 text-sm text-grey">
              É isto que a {nomeMarca} vai receber. Nada sai antes de confirmares.
            </p>
            {rel.email_html?.trim() ? (
              <div
                className="mt-4 overflow-x-auto rounded-xl border border-line p-4"
                dangerouslySetInnerHTML={{ __html: rel.email_html }}
              />
            ) : (
              <p className="mt-4 text-sm text-bad">Este relatório ainda não tem corpo de email.</p>
            )}
          </section>

          <section className="mt-5 rounded-2xl border border-line bg-white p-6">
            <ConfirmarEnvio token={token} destino={destino} copia={copia} />
          </section>
        </>
      )}

      <footer className="mt-6 text-center text-[11px] text-soft">
        Nº 5 · marca operada por Os Caetanos, Lda · NIF 504428918
      </footer>
    </main>
  );
}
