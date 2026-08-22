/**
 * N5 AI OS · retenção (RGPD).
 *
 * Corre uma vez por dia e apaga o que passou do prazo declarado em
 * `retention_days`. Existe porque uma política de retenção escrita que
 * ninguém executa é pior do que não ter política nenhuma: dá conforto sem
 * dar proteção, e é indefensável perante uma autoridade.
 *
 * O trabalho a sério está na função `ai_limpar_retencao()`, no Postgres,
 * que também grava o que apagou — para se poder DEMONSTRAR que a política
 * é cumprida, e não apenas afirmá-lo.
 *
 * De madrugada, quando não há tráfego: apagar linhas de tabelas com
 * escrita concorrente pega bloqueios, e às 4h ninguém está à espera.
 */

export const config = { schedule: "17 4 * * *" };

export default async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Response("sem config", { status: 200 });

  try {
    const r = await fetch(`${url}/rest/v1/rpc/ai_limpar_retencao`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(280_000),
    });
    const apagados = await r.json().catch(() => null);

    console.log(JSON.stringify({ evento: "n5_ai_retencao", ok: r.ok, apagados }));
    return new Response(JSON.stringify({ ok: r.ok, apagados }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  } catch (e) {
    // Falhar em silêncio numa obrigação legal é o pior desfecho. Fica no
    // registo do Netlify, que é onde o watchdog externo também escreve.
    console.error("[n5-ai] retenção falhou:", String(e));
    return new Response("erro", { status: 200 });
  }
};
