/**
 * Envio de email transacional pela API do Resend.
 * O domínio numerocinco.pt está verificado, por isso pode sair de geral@.
 *
 *   RESEND_API_KEY   = a chave da API do Resend (nas variáveis do Netlify)
 *   EMAIL_REMETENTE  = opcional, ex.: "Nº 5 <geral@numerocinco.pt>"
 *   EMAIL_REPLY_TO   = opcional, para onde vão as respostas do cliente
 */

const REMETENTE = process.env.EMAIL_REMETENTE || "Nº 5 <geral@numerocinco.pt>";

function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type EnvioEmail = { ok: true } | { ok: false; erro: string };

export async function enviarEmailResend(opts: {
  para: string;
  assunto: string;
  /** Corpo em texto simples. */
  texto: string;
  /** Link a destacar como botão (opcional). */
  link?: string;
  replyTo?: string | null;
}): Promise<EnvioEmail> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave)
    return {
      ok: false,
      erro: "Falta a RESEND_API_KEY nas variáveis do Netlify. Adiciona-a e volta a tentar.",
    };

  // HTML simples: o texto com quebras de linha + o link como botão dourado.
  const corpoHtml = escaparHtml(opts.texto).replace(/\n/g, "<br>");
  const botao = opts.link
    ? `<p style="margin:24px 0"><a href="${opts.link}" style="background:#E8A13C;color:#15181D;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;display:inline-block">Abrir</a></p><p style="font-size:12px;color:#888">Ou copia: ${escaparHtml(opts.link)}</p>`
    : "";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#15181D">${corpoHtml}${botao}</div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${chave}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: REMETENTE,
        to: [opts.para],
        subject: opts.assunto,
        text: opts.link ? `${opts.texto}\n\n${opts.link}` : opts.texto,
        html,
        ...(opts.replyTo || process.env.EMAIL_REPLY_TO
          ? { reply_to: opts.replyTo || process.env.EMAIL_REPLY_TO }
          : {}),
      }),
    });
    if (!r.ok) {
      const d = await r.text();
      return { ok: false, erro: `Resend respondeu ${r.status}. ${d.slice(0, 140)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: String(e) };
  }
}
