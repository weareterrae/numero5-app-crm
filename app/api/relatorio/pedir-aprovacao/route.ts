import { NextResponse, type NextRequest } from "next/server";
import { criarClienteServico } from "@/lib/supabase/server";
import { enviarEmailResend } from "@/lib/email/resend";
import { mesLegivel } from "@/lib/dominio/producao";
import {
  baseApp,
  emailOperador,
  montarEmailAprovacao,
  remetenteRelatorios,
} from "@/lib/email/relatorios";

/**
 * Dispara o email de aprovação de um relatório para o operador.
 * Chamado pelo gerador (Claude Code) depois de deixar o rascunho pronto.
 *
 * Não leva segredo: o `id` é um uuid não-adivinhável e o email só vai para o
 * operador (endereço fixo). Idempotente — só envia se ainda não foi enviado
 * (a menos que venha `forcar: true`).
 */
export async function POST(req: NextRequest) {
  let d: { id?: string; forcar?: boolean };
  try {
    d = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "corpo inválido" }, { status: 400 });
  }
  const id = (d.id ?? "").toString().trim();
  if (!id) return NextResponse.json({ ok: false, erro: "falta o id" }, { status: 400 });

  const supabase = criarClienteServico();
  const { data: rel } = await supabase
    .from("relatorios")
    .select("id, cliente_id, mes, titulo, email_html, aprovar_token, aprovacao_enviada_em, aprovado_em, clientes(nome_marca, idioma)")
    .eq("id", id)
    .maybeSingle();
  if (!rel) return NextResponse.json({ ok: false, erro: "relatório não existe" }, { status: 404 });
  if (rel.aprovado_em)
    return NextResponse.json({ ok: false, erro: "já foi enviado ao cliente" }, { status: 409 });
  if (rel.aprovacao_enviada_em && !d.forcar)
    return NextResponse.json({ ok: true, jaEnviado: true });
  if (!rel.email_html?.trim())
    return NextResponse.json({ ok: false, erro: "relatório sem corpo de email" }, { status: 422 });

  const cliente = (Array.isArray(rel.clientes) ? rel.clientes[0] : rel.clientes) as
    | { nome_marca: string; idioma?: string | null }
    | null;
  const nomeMarca = cliente?.nome_marca ?? "Cliente";

  // Email do contacto principal (só para mostrar no preview).
  const { data: contacto } = await supabase
    .from("contactos")
    .select("email")
    .eq("cliente_id", rel.cliente_id)
    .order("principal", { ascending: false })
    .limit(1)
    .maybeSingle();

  const copia = emailOperador();
  const { assunto, html, texto } = montarEmailAprovacao({
    nomeMarca,
    mesLabel: mesLegivel(rel.mes),
    emailCliente: contacto?.email ?? null,
    emailCopia: copia,
    previewHtml: rel.email_html,
    linkAprovar: `${baseApp()}/r/aprovar-relatorio/${rel.aprovar_token}`,
  });

  const envio = await enviarEmailResend({
    para: copia,
    assunto,
    texto,
    html,
    remetente: remetenteRelatorios(),
  });
  if (!envio.ok) return NextResponse.json({ ok: false, erro: envio.erro }, { status: 502 });

  await supabase
    .from("relatorios")
    .update({ aprovacao_enviada_em: new Date().toISOString() })
    .eq("id", rel.id);

  return NextResponse.json({ ok: true, para: copia });
}
