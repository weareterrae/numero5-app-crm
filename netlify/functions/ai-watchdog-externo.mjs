/**
 * N5 AI OS · watchdog EXTERNO.
 *
 * Os vigias são bons, mas correm DENTRO do Supabase e escrevem os alertas
 * numa tabela do Supabase. Se o Supabase inteiro cair, os vigias não
 * correm, os incidentes não se gravam e o painel não abre. Resultado:
 * gateway em baixo + monitor em baixo + painel em baixo = SILÊNCIO. É a
 * pior avaria possível, porque não parece avaria nenhuma.
 *
 * Esta função corre no Netlify — outro fornecedor, outra rede, outra conta
 * — e o seu único trabalho é: falar com o gateway como um visitante e, se
 * ele não responder, mandar um email por um terceiro caminho (Resend).
 *
 * Deliberadamente burra e sem dependências do que monitoriza:
 *   · não lê a base de dados;
 *   · não escreve incidentes;
 *   · não usa a biblioteca do Supabase.
 * Só um fetch e, no pior caso, um email.
 *
 * De 10 em 10 minutos. Mais frequente do que os vigias porque isto não
 * custa nada e é o último aviso antes do silêncio.
 *
 * Env: N5_GATEWAY_URL, RESEND_API_KEY, N5_ALERTA_PARA (opcional).
 */

export const config = { schedule: "*/10 * * * *" };

// Duas falhas seguidas antes de acordar alguém. Um soluço de rede de 3
// segundos não é uma avaria de plataforma, e um alerta que grita por
// soluços deixa de ser lido — que é como se perde o alerta a sério.
const TENTATIVAS = 2;

const PARA = process.env.N5_ALERTA_PARA || "sandro.qb@gmail.com";
const DE = process.env.RAIOX_FROM || "Nº 5 <geral@numerocinco.pt>";

async function tentar(url) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://numerocinco.pt" },
      body: JSON.stringify({
        assistant_key: "numerocinco-quinto",
        messages: [{ role: "user", content: "Olá" }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const texto = await r.text();
    const ms = Date.now() - t0;

    if (!r.ok) return { ok: false, motivo: `http ${r.status}`, ms };

    // Não basta o transporte responder: o erro do gateway vai DENTRO do
    // fluxo, com HTTP 200. Um 200 vazio é exatamente o sintoma de que o
    // gateway está de pé mas não serve ninguém.
    let conteudo = "";
    for (const l of texto.split("\n")) {
      const s = l.trim();
      if (!s.startsWith("data:")) continue;
      try {
        const ev = JSON.parse(s.slice(5).trim());
        if (ev.type === "delta") conteudo += ev.text;
        if (ev.type === "error") return { ok: false, motivo: `erro ${ev.code}`, ms };
      } catch { /* fragmento */ }
    }
    if (conteudo.trim().length < 20) return { ok: false, motivo: "resposta vazia", ms };
    return { ok: true, ms, amostra: conteudo.slice(0, 80) };
  } catch (e) {
    return { ok: false, motivo: String(e?.message || e).slice(0, 120), ms: Date.now() - t0 };
  }
}

async function alertar(assunto, corpo) {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) {
    // Sem caminho de alerta, o mínimo é deixar rasto nos registos do
    // Netlify — que continuam de pé quando o Supabase não está.
    console.error("[watchdog] SEM RESEND_API_KEY. " + assunto + " · " + corpo);
    return;
  }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${chave}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: DE, to: [PARA], subject: assunto,
        text: corpo + "\n\n— watchdog externo do N5 AI OS (corre no Netlify, fora do Supabase)",
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.error("[watchdog] nem o email saiu:", String(e));
  }
}

export default async () => {
  const url = process.env.N5_GATEWAY_URL;
  if (!url) {
    console.error("[watchdog] sem N5_GATEWAY_URL");
    return new Response("sem config", { status: 200 });
  }

  const tentativas = [];
  for (let i = 0; i < TENTATIVAS; i++) {
    const r = await tentar(url);
    tentativas.push(r);
    if (r.ok) {
      console.log(JSON.stringify({ evento: "n5_watchdog", ok: true, ms: r.ms, tentativa: i + 1 }));
      return new Response(JSON.stringify({ ok: true, ms: r.ms }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (i < TENTATIVAS - 1) await new Promise((s) => setTimeout(s, 5000));
  }

  const detalhe = tentativas.map((t, i) => `  ${i + 1}. ${t.motivo} (${t.ms} ms)`).join("\n");
  console.error(JSON.stringify({ evento: "n5_watchdog", ok: false, tentativas }));
  await alertar(
    "N5 AI OS não responde",
    `O gateway não respondeu a ${TENTATIVAS} tentativas seguidas.\n\n${detalhe}\n\n` +
    `Endereço testado: ${url}\n` +
    "Se este email chegou, o Netlify e o Resend estão de pé — o problema é do lado do Supabase\n" +
    "ou dos fornecedores de modelos. Os assistentes dos sites devem estar a servir pelo caminho\n" +
    "antigo; verifica se algum deles já não tem esse caminho.",
  );

  // 200 de propósito: um 500 aqui só faz o Netlify repetir e mandar mais
  // emails. O alerta já saiu.
  return new Response(JSON.stringify({ ok: false }), {
    status: 200, headers: { "content-type": "application/json" },
  });
};
