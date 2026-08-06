/**
 * Notificações da Sede — email ao contacto principal do cliente quando
 * publicamos algo que precisa dele (plano a aprovar, relatório novo).
 * Fire-and-forget: falhar o email nunca falha a publicação.
 */

import { criarClienteServico } from "@/lib/supabase/server";
import { enviarEmailResend } from "@/lib/email/resend";

const SEDE_URL = "https://app.numerocinco.pt/sede";

export async function notificarClienteSede(
  clienteId: string,
  tipo: "plano" | "relatorio",
): Promise<void> {
  try {
    const svc = criarClienteServico();

    // Só notifica se o cliente tiver Sede ligada (org com cliente_id).
    const { data: org } = await svc.from("orgs").select("id, nome").eq("cliente_id", clienteId).maybeSingle();
    if (!org) return;

    const { data: contacto } = await svc
      .from("contactos")
      .select("nome, email")
      .eq("cliente_id", clienteId)
      .eq("principal", true)
      .limit(1)
      .maybeSingle();
    if (!contacto?.email) return;

    const nome = (contacto.nome || "").split(" ")[0] || "olá";
    const msg =
      tipo === "plano"
        ? {
            assunto: `O teu plano do mês está pronto para aprovares 🖐️`,
            texto: `Olá ${nome}!\n\nO plano do próximo mês de ${org.nome} já está na tua Sede, à espera da tua aprovação. Vê com calma e diz-nos algo — aprovar leva menos de um minuto.`,
            link: `${SEDE_URL}/plano`,
          }
        : {
            assunto: `O teu relatório do mês chegou 🖐️`,
            texto: `Olá ${nome}!\n\nO relatório do mês de ${org.nome} já está na tua Sede — os números todos do que fizemos, em linguagem de gente.`,
            link: `${SEDE_URL}/relatorio`,
          };

    const r = await enviarEmailResend({ para: contacto.email, ...msg });
    await svc.from("atividades").insert({
      cliente_id: clienteId,
      tipo: "nota",
      descricao: r.ok
        ? `📬 Cliente notificado por email (${tipo === "plano" ? "plano a aprovar" : "relatório novo"}).`
        : `⚠️ Falhou o email ao cliente (${tipo}): ${("erro" in r && r.erro) || "?"}`,
    });
  } catch {
    /* nunca partir a publicação por causa do email */
  }
}

const APP_URL = "https://app.numerocinco.pt";

/**
 * Aviso ao STAFF (a nós) sempre que um cliente RESPONDE ou AGE — aprova/recusa
 * um plano ou proposta, preenche o guia ou o diagnóstico, abre um pedido, etc.
 * Serve para saber quando é preciso ir trabalhar à app.
 * Fire-and-forget: falhar o email nunca falha a ação do cliente.
 *
 *   EMAIL_AVISOS = para onde vão os avisos (default: sandro.sousa@numerocinco.pt)
 */
export async function avisarStaffAcao(opts: {
  clienteId: string;
  titulo: string; // ex.: "aprovou o plano mensal"
  detalhe?: string; // linha extra opcional (ex.: comentário do cliente)
  caminho?: string; // rota do operador a abrir (default: ficha do cliente)
}): Promise<void> {
  try {
    const svc = criarClienteServico();
    let marca = "Um cliente";
    try {
      const { data } = await svc.from("clientes").select("nome_marca").eq("id", opts.clienteId).maybeSingle();
      if (data?.nome_marca) marca = data.nome_marca as string;
    } catch {
      /* nome é opcional */
    }
    const para = process.env.EMAIL_AVISOS || "sandro.sousa@numerocinco.pt";
    const link = APP_URL + (opts.caminho || `/clientes/${opts.clienteId}`);
    await enviarEmailResend({
      para,
      assunto: `🖐️ ${marca} — ${opts.titulo}`,
      texto: `${marca} ${opts.titulo}.${opts.detalhe ? `\n\n${opts.detalhe}` : ""}\n\nHá trabalho à tua espera na app.`,
      link,
    });
  } catch {
    /* nunca partir a ação do cliente por causa do email */
  }
}
