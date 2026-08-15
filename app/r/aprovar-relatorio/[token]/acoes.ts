"use server";

import { criarClienteServico } from "@/lib/supabase/server";
import { mesLegivel } from "@/lib/dominio/producao";
import { idiomaDe } from "@/lib/dominio/intake";
import { enviarEmailResend } from "@/lib/email/resend";
import {
  baseApp,
  emailOperador,
  montarEmailCliente,
  remetenteRelatorios,
} from "@/lib/email/relatorios";

export type EstadoConfirmar = { ok: boolean; msg: string; enviado?: boolean };

/**
 * O operador confirma, a partir do email de aprovação, o envio do relatório ao
 * cliente. Sem sessão: o `aprovar_token` é a chave. Sai de giveme5@numerocinco.pt,
 * com o operador em CC. Idempotente — se já foi enviado, não repete.
 */
export async function confirmarEnvioRelatorio(
  _prev: EstadoConfirmar,
  formData: FormData,
): Promise<EstadoConfirmar> {
  const token = (formData.get("token") ?? "").toString().trim();
  if (!token) return { ok: false, msg: "Pedido inválido." };

  const supabase = criarClienteServico();
  const { data: rel } = await supabase
    .from("relatorios")
    .select(
      "id, cliente_id, mes, email_html, partilha_token, aprovado_em, clientes(nome_marca, idioma)",
    )
    .eq("aprovar_token", token)
    .maybeSingle();
  if (!rel) return { ok: false, msg: "Relatório não encontrado." };
  if (rel.aprovado_em) return { ok: true, enviado: true, msg: "Este relatório já foi enviado." };
  if (!rel.email_html?.trim()) return { ok: false, msg: "O relatório não tem corpo de email." };

  const cliente = (Array.isArray(rel.clientes) ? rel.clientes[0] : rel.clientes) as
    | { nome_marca: string; idioma?: string | null }
    | null;
  const nomeMarca = cliente?.nome_marca ?? "Cliente";
  const idioma = idiomaDe(cliente?.idioma);

  const { data: contacto } = await supabase
    .from("contactos")
    .select("nome, email")
    .eq("cliente_id", rel.cliente_id)
    .order("principal", { ascending: false })
    .limit(1)
    .maybeSingle();

  const copia = emailOperador();
  // Sem email do cliente, o envio vai para o próprio operador (fica seguro).
  const destino = contacto?.email?.trim() || copia;
  const primeiroNome = contacto?.nome ? contacto.nome.split(" ")[0] : null;

  const { assunto, html, texto } = montarEmailCliente({
    primeiroNome,
    nomeMarca,
    mesLabel: mesLegivel(rel.mes, idioma),
    corpoInterno: rel.email_html,
    linkRelatorio: `${baseApp()}/r/mes/${rel.partilha_token}`,
    idioma,
  });

  const envio = await enviarEmailResend({
    para: destino,
    cc: destino === copia ? undefined : copia, // não faz CC para o próprio destino
    assunto,
    texto,
    html,
    remetente: remetenteRelatorios(),
  });
  if (!envio.ok) return { ok: false, msg: envio.erro };

  const agora = new Date().toISOString();
  await supabase
    .from("relatorios")
    .update({
      estado: "enviado",
      partilha_ativa: true,
      enviado_em: agora,
      aprovado_em: agora,
      email_cliente: destino,
    })
    .eq("id", rel.id);

  await supabase.from("atividades").insert({
    cliente_id: rel.cliente_id,
    tipo: "email",
    descricao: `Relatório de ${mesLegivel(rel.mes, idioma)} enviado para ${destino}${destino === copia ? "" : ` (CC ${copia})`}.`,
  });

  return { ok: true, enviado: true, msg: `Enviado para ${destino} ✓` };
}
