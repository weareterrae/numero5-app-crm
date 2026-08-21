/**
 * N5 AI OS · agendador das probes sintéticas.
 *
 * De 15 em 15 minutos, invoca a Edge Function `ai-probe`, que testa cada
 * modelo roteável com um prompt mínimo e atualiza o health registry e o
 * disjuntor.
 *
 * Porquê aqui e não em pg_cron: este repositório já tem cinco funções
 * agendadas na Netlify a funcionar bem. Reutilizar o padrão existente
 * poupa uma extensão nova na base de dados e mantém todos os agendamentos
 * no mesmo sítio. (Se um dia o gateway sair da Netlify, muda-se este
 * ficheiro — o resto do N5 AI OS não sabe que ele existe.)
 *
 * Objetivo: dar o alarme ANTES do utilizador. A 20/08/2026 foi o Sandro a
 * descobrir que os assistentes estavam em baixo; isto existe para que a
 * próxima vez seja o sistema a dizê-lo primeiro.
 *
 * Env (já no Netlify): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Sem estas, sai em silêncio.
 */

export const config = { schedule: "*/15 * * * *" };

export default async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("[n5-ai] probe-cron: faltam variáveis de ambiente, a sair.");
    return new Response("sem config", { status: 200 });
  }

  try {
    const r = await fetch(`${url}/functions/v1/ai-probe`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(240_000),
    });
    const j = await r.json().catch(() => ({}));
    const probes = j.probes ?? [];
    const maus = probes.filter((p) => p.ok === false);

    // Log estruturado: dá para procurar nos registos da Netlify.
    console.log(JSON.stringify({
      evento: "n5_ai_probe",
      total: probes.length,
      saudaveis: probes.length - maus.length,
      com_problema: maus.length,
      duracao_ms: j.duracao_ms,
      modelos_em_baixo: maus.map((p) => `${p.modelo}:${p.status}`),
    }));

    return new Response(JSON.stringify({ ok: true, com_problema: maus.length }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[n5-ai] probe-cron falhou:", String(e));
    return new Response("erro", { status: 200 }); // nunca falhar o agendamento
  }
};
