/**
 * Composição dos emails dos relatórios mensais.
 *
 * Dois emails, o mesmo corpo por dentro:
 *  - o de aprovação (vai para o operador): mostra o preview exato do que o
 *    cliente vai receber, com um botão "Confirmar e enviar ao cliente";
 *  - o do cliente: saudação + o resumo do mês (email_html) + botão para o
 *    relatório visual completo.
 *
 * O corpo interno (email_html) é produzido no Claude Code, seguro para email
 * (sem SVG, só estilos inline). Aqui só se embrulha com saudação, botão e pé.
 */

const RODAPE_PT = "Nº 5 · o departamento de marketing das marcas que não têm um.";
const RODAPE_EN = "Nº 5 · the marketing department for brands that don't have one.";

/** Base pública da app (para os links dos emails). */
export function baseApp(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://app.numerocinco.pt").replace(/\/$/, "");
}

/** Remetente dos relatórios. Domínio numerocinco.pt já verificado no Resend. */
export function remetenteRelatorios(): string {
  return process.env.EMAIL_RELATORIOS || "Nº 5 <giveme5@numerocinco.pt>";
}

/** Para onde vai o email de aprovação e o CC do envio ao cliente (o operador). */
export function emailOperador(): string {
  return process.env.EMAIL_COPIA || process.env.DIGEST_EMAIL || "sandro.sousa@numerocinco.pt";
}

function botao(href: string, texto: string, escuro = false): string {
  const bg = escuro ? "#15181D" : "#E8A13C";
  const cor = escuro ? "#F5F4F0" : "#15181D";
  return `<a href="${href}" style="background:${bg};color:${cor};font-weight:700;text-decoration:none;padding:13px 26px;border-radius:999px;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:15px">${texto}</a>`;
}

/** O email que o cliente recebe. */
export function montarEmailCliente(o: {
  primeiroNome?: string | null;
  nomeMarca: string;
  mesLabel: string;
  corpoInterno: string; // email_html
  linkRelatorio: string;
  idioma: "pt" | "en";
}): { assunto: string; html: string; texto: string } {
  const pt = o.idioma !== "en";
  const ola = o.primeiroNome ? `${pt ? "Olá" : "Hi"} ${o.primeiroNome}` : pt ? "Olá" : "Hi";
  const intro = pt
    ? `${ola}! 🖐️ Fechámos ${o.mesLabel} e aqui está o resumo do que aconteceu com a ${o.nomeMarca}. Os números ao fundo, e o relatório completo com os gráficos no botão.`
    : `${ola}! 🖐️ We've wrapped up ${o.mesLabel} — here's a summary of what happened with ${o.nomeMarca}. The numbers below, and the full report with charts in the button.`;
  const verTudo = pt ? "Ver o relatório completo" : "View the full report";
  const assunto = pt
    ? `O teu mês em números · ${o.nomeMarca} · ${o.mesLabel}`
    : `Your month in numbers · ${o.nomeMarca} · ${o.mesLabel}`;

  const html = `<div style="max-width:640px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#15181D">
    <p style="margin:0 0 18px">${intro}</p>
    ${o.corpoInterno}
    <p style="margin:26px 0">${botao(o.linkRelatorio, verTudo)}</p>
    <p style="margin:28px 0 0;font-size:12px;color:#8A8F98">${pt ? RODAPE_PT : RODAPE_EN}</p>
  </div>`;

  const texto = `${intro}\n\n${verTudo}: ${o.linkRelatorio}`;
  return { assunto, html, texto };
}

/** O email de aprovação que o operador recebe (preview + botão de confirmar). */
export function montarEmailAprovacao(o: {
  nomeMarca: string;
  mesLabel: string;
  emailCliente: string | null;
  emailCopia: string;
  previewHtml: string; // o mesmo HTML que o cliente vai receber
  linkAprovar: string;
}): { assunto: string; html: string; texto: string } {
  const destino = o.emailCliente || "(sem email do cliente — ao confirmar, vai para ti)";
  const banner = `<div style="background:#FBF3E2;border:1px solid #E8A13C;border-radius:12px;padding:14px 16px;margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#15181D">
    <b>Pré-visualização.</b> Isto é o que a ${o.nomeMarca} vai receber. Nada sai antes de confirmares.<br>
    <span style="color:#6B7280">Para: <b>${destino}</b> · CC: <b>${o.emailCopia}</b></span>
    <div style="margin-top:14px">${botao(o.linkAprovar, "Confirmar e enviar ao cliente →", true)}</div>
  </div>`;
  const html = `<div style="max-width:640px;margin:0 auto">${banner}
    <div style="border:1px solid #E7E5E0;border-radius:12px;padding:20px">${o.previewHtml}</div>
    <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8A8F98">Se algo estiver errado, corrige no relatório e gera outra vez — este link deixa de valer quando enviares.</p>
  </div>`;
  const assunto = `Aprovar relatório · ${o.nomeMarca} · ${o.mesLabel}`;
  const texto = `Relatório da ${o.nomeMarca} (${o.mesLabel}) pronto. Para confirmar o envio ao cliente (${destino}), abre: ${o.linkAprovar}`;
  return { assunto, html, texto };
}
