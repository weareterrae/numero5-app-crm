/**
 * N5 AI OS · perguntas de referência.
 *
 * Os vigias, de 30 em 30 minutos, respondem a «está de pé?». Isto responde
 * à pergunta seguinte: «continua a responder BEM?».
 *
 * Uma vez por dia, não de meia em meia hora, e a razão não é preguiça:
 * cada avaliação são duas chamadas a modelos (responder + julgar) e o que
 * se mede é TENDÊNCIA. Um assistente não se degrada em trinta minutos;
 * degrada-se ao longo de semanas, quando um modelo muda por baixo ou um
 * prompt é editado sem se reparar no efeito.
 *
 * De madrugada, depois da retenção, quando não há tráfego a competir.
 */

export const config = { schedule: "40 4 * * *" };

export default async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Response("sem config", { status: 200 });

  try {
    const r = await fetch(`${url}/functions/v1/ai-qualidade`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(280_000),
    });
    const j = await r.json().catch(() => ({}));

    console.log(JSON.stringify({
      evento: "n5_ai_qualidade",
      avaliadas: j.avaliadas ?? 0,
      media: j.media ?? null,
      abaixo_de_3: j.abaixo_de_3 ?? 0,
      // Só as que correram mal: uma lista com tudo não se lê.
      fracas: (j.resultados ?? []).filter((x) => x.erro || (x.nota != null && x.nota < 3)),
    }));

    return new Response(JSON.stringify({ ok: true, media: j.media ?? null }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[n5-ai] qualidade falhou:", String(e));
    return new Response("erro", { status: 200 });
  }
};
