// Gera o troço de código que liga um site ao N5 AI Gateway.
//
// Desenho: o site chama SEMPRE o gateway. É o gateway que decide se este
// pedido pertence à fatia migrada (traffic_percentage no registo). Se
// disser que não — ou se falhar, ou estiver em baixo — o site segue pelo
// caminho antigo e o visitante não dá por nada.
//
// Consequência prática: cada site precisa de DUAS variáveis apenas,
// e a percentagem muda no painel sem tocar em nenhum repositório.
export const BLOCO_N5 = `
// ---------------------------------------------------------------------
// N5 AI Gateway — migração progressiva
// ---------------------------------------------------------------------
// O gateway decide se serve este pedido (percentagem no painel AI
// Operations, sem deploy). Se recusar ou falhar, seguimos pelo caminho
// antigo — o visitante nunca fica sem resposta.
const N5_GATEWAY_URL = process.env.N5_GATEWAY_URL;
const N5_ASSISTANT_KEY = process.env.N5_ASSISTANT_KEY;

async function n5Gateway(messages, { lang, origin, sessionId, system } = {}) {
  if (!N5_GATEWAY_URL || !N5_ASSISTANT_KEY) return null;
  try {
    const r = await fetch(N5_GATEWAY_URL, {
      method: "POST",
      headers: { "content-type": "application/json", origin: origin || "" },
      body: JSON.stringify({
        assistant_key: N5_ASSISTANT_KEY,
        session_id: sessionId,
        messages,
        lang,
        ...(system ? { system } : {}),
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok || !r.body) return null;

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "", texto = "", erro = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const linhas = buf.split(String.fromCharCode(10));
      buf = linhas.pop() ?? "";
      for (const l of linhas) {
        const t = l.trim();
        if (!t.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(t.slice(5).trim());
          if (ev.type === "delta") texto += ev.text;
          else if (ev.type === "error") erro = ev.code;
        } catch { /* fragmento incompleto */ }
      }
    }
    // 'rollout_excluded' é resposta normal, não avaria: este pedido não
    // pertence à fatia migrada.
    if (erro || !texto.trim()) return null;
    return texto;
  } catch {
    return null;
  }
}
`;

console.log(BLOCO_N5);
