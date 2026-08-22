/**
 * N5 AI OS · agendador dos vigias ponta a ponta.
 *
 * De 30 em 30 minutos pergunta a sério a cada assistente e verifica a
 * resposta. Diferente do ai-probe-cron, que testa MODELOS: este testa
 * os ASSISTENTES, no endpoint real que o visitante usa.
 *
 * A distinção não é académica. A 22/08/2026 descobriu-se que o painel
 * dava verde para o Joaquim da Terrae testando só o `estado-motor` — o
 * motor tinha chave, mas ninguém verificava se o Joaquim respondia.
 *
 * Env (já no Netlify): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

export const config = { schedule: "*/30 * * * *" };

export default async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Response("sem config", { status: 200 });

  try {
    const r = await fetch(`${url}/functions/v1/ai-vigia`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(300_000),
    });
    const j = await r.json().catch(() => ({}));
    const falhas = (j.resultados ?? []).filter((x) => !x.ok);

    console.log(JSON.stringify({
      evento: "n5_ai_vigia",
      total: j.total ?? 0,
      falhas: falhas.length,
      // O motivo importa tanto como o facto: 'sem_pesquisa' e
      // 'texto_proibido' são falhas de QUALIDADE, não de disponibilidade.
      detalhe: falhas.map((f) => `${f.vigia}:${f.motivo}`),
    }));

    return new Response(JSON.stringify({ ok: true, falhas: falhas.length }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[n5-ai] vigia-cron falhou:", String(e));
    return new Response("erro", { status: 200 });
  }
};
