// =====================================================================
// Motor de qualidade — mede se a resposta é BOA, não só se existe
// ---------------------------------------------------------------------
// Os vigias respondem à pergunta "está de pé?". Esta função responde à
// pergunta que interessa a seguir: "continua a responder bem?".
//
// Como funciona: para cada pergunta de referência, pede-se a resposta ao
// assistente REAL (pelo gateway, como um visitante) e entrega-se essa
// resposta a um segundo modelo, com os critérios escritos, para julgar.
//
// Três regras de desenho, e todas custaram para se aprender:
//
//  1. O JUIZ NUNCA É DO MESMO FORNECEDOR que respondeu. Um modelo a
//     julgar-se a si próprio é complacente, e dois modelos da mesma casa
//     partilham vieses. Se não houver alternativa, não se avalia — vale
//     mais não ter nota do que ter uma nota que mente.
//
//  2. O JUIZ VÊ CRITÉRIOS, NÃO UMA RESPOSTA-MODELO. Respostas certas
//     escrevem-se de muitas maneiras. Foi comparar contra texto esperado
//     que fez o vigia por palavras-chave ser retirado.
//
//  3. GUARDA-SE A JUSTIFICAÇÃO. Uma nota sem porquê não diz o que mudou.
//
// Corre uma vez por dia. Isto custa dinheiro e mede TENDÊNCIA — não é um
// teste de disponibilidade.
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const GATEWAY = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-chat`;
const CHAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ehServiceRole(auth: string): boolean {
  const t = auth.replace(/^Bearer\s+/i, "").trim().split(".");
  if (t.length !== 3) return false;
  try {
    const b = t[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b + "=".repeat((4 - b.length % 4) % 4)))?.role === "service_role";
  } catch { return false; }
}

/** Lê um fluxo SSE do gateway e devolve o texto mais o modelo usado. */
async function pedirAoGateway(corpo: Record<string, unknown>, origem: string) {
  const t0 = Date.now();
  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json", origin: origem, authorization: `Bearer ${CHAVE}` },
    body: JSON.stringify({ ...corpo, ensaio: true }),
    signal: AbortSignal.timeout(240_000),
  });
  const bruto = await r.text();
  let texto = "", erro: string | null = null, requestId: string | null = null;
  for (const l of bruto.split("\n")) {
    const s = l.trim();
    if (!s.startsWith("data:")) continue;
    try {
      const ev = JSON.parse(s.slice(5).trim());
      if (ev.type === "delta") texto += ev.text;
      else if (ev.type === "error") erro = ev.code;
      else if (ev.type === "start") requestId = ev.request_id;
    } catch { /* fragmento */ }
  }
  return { texto, erro, requestId, ms: Date.now() - t0 };
}

const SYS_JUIZ =
  "És um avaliador exigente e justo. Recebes uma PERGUNTA, os CRITÉRIOS que a resposta " +
  "tem de cumprir, e a RESPOSTA que foi dada. Avalias a resposta contra os critérios, " +
  "nada mais.\n\n" +
  "Não penalizes por estilo, ordem ou palavras diferentes das dos critérios: uma resposta " +
  "certa pode ser escrita de muitas maneiras. Penaliza por: factos errados, critérios não " +
  "cumpridos, vaguidade que não ajuda quem perguntou, sair de personagem, ou inventar " +
  "informação que não foi dada.\n\n" +
  "Responde SÓ com JSON: " +
  '{"nota":0-5,"justificacao":"uma ou duas frases","falhas":["critério que não passou"]}\n' +
  "5 = cumpre tudo e seria útil a um cliente real. 3 = cumpre o essencial mas fica aquém. " +
  "0 = errada, fora de personagem, ou não responde.";

Deno.serve(async (req) => {
  if (!ehServiceRole(req.headers.get("authorization") ?? "")) {
    return new Response(JSON.stringify({ erro: "nao autorizado" }), { status: 401 });
  }

  const { data: perguntas } = await db
    .from("ai_perguntas_referencia").select("*").eq("ativo", true);

  const saida: unknown[] = [];

  for (const p of perguntas ?? []) {
    const { data: assistente } = await db
      .from("ai_assistants").select("allowed_domains").eq("assistant_key", p.assistant_key).maybeSingle();
    const origem = (assistente?.allowed_domains ?? [])[0] ?? "https://numerocinco.pt";

    let registo: Record<string, unknown> = { pergunta_id: p.id };

    try {
      // ---- 1. a resposta REAL, pelo caminho real
      const r = await pedirAoGateway({
        assistant_key: p.assistant_key,
        ...(p.system ? { system: p.system } : {}),
        messages: [{ role: "user", content: p.pergunta }],
      }, origem);

      if (r.erro || !r.texto.trim()) {
        registo.erro = r.erro ?? "resposta vazia";
        await db.from("ai_avaliacoes").insert(registo);
        saida.push({ pergunta: p.nome, erro: registo.erro });
        continue;
      }

      // que modelo respondeu — para escolher um juiz de outra casa
      const { data: pedido } = r.requestId
        ? await db.from("ai_requests").select("provider_id, provider_model_id, estimated_cost")
            .eq("request_id", r.requestId).maybeSingle()
        : { data: null };

      registo = {
        ...registo,
        modelo_resposta: pedido?.provider_model_id ?? null,
        resposta: r.texto.slice(0, 8000),
        latencia_ms: r.ms,
        custo_usd: pedido?.estimated_cost ?? null,
      };

      // ---- 2. o juiz, obrigatoriamente de OUTRO fornecedor
      const { data: modelosJuiz } = await db
        .from("ai_models")
        .select("provider_id, provider_model_id")
        .eq("status", "ACTIVE")
        .neq("provider_id", pedido?.provider_id ?? "nenhum")
        .order("input_cost", { ascending: false })   // o melhor disponível: julgar é o trabalho difícil
        .limit(1);

      const juiz = modelosJuiz?.[0];
      if (!juiz) {
        registo.erro = "sem juiz de outro fornecedor disponível";
        await db.from("ai_avaliacoes").insert(registo);
        saida.push({ pergunta: p.nome, erro: registo.erro });
        continue;
      }

      const material =
        `PERGUNTA:\n${p.pergunta}\n\nCRITÉRIOS:\n${p.criterios}\n\nRESPOSTA DADA:\n${r.texto}`;

      const j = await pedirAoGateway({
        assistant_key: "juiz-qualidade",
        system: SYS_JUIZ,
        response_format: "json",
        max_output_tokens: 800,
        messages: [{ role: "user", content: material }],
      }, "https://app.numerocinco.pt");

      let veredicto: any = null;
      try { veredicto = JSON.parse(j.texto.replace(/^```json\s*|\s*```$/g, "").trim()); } catch { /* abaixo */ }

      if (!veredicto || typeof veredicto.nota !== "number") {
        registo.erro = "o juiz não devolveu veredicto utilizável";
        await db.from("ai_avaliacoes").insert(registo);
        saida.push({ pergunta: p.nome, erro: registo.erro });
        continue;
      }

      registo = {
        ...registo,
        modelo_juiz: juiz.provider_model_id,
        nota: Math.max(0, Math.min(5, Math.round(veredicto.nota))),
        justificacao: String(veredicto.justificacao ?? "").slice(0, 1000),
        falhas: Array.isArray(veredicto.falhas) ? veredicto.falhas.map(String).slice(0, 10) : null,
      };
      await db.from("ai_avaliacoes").insert(registo);
      saida.push({ pergunta: p.nome, assistente: p.assistant_key, nota: registo.nota });

      // Uma nota baixa numa pergunta com peso alto é incidente. Não se
      // espera pela tendência: se o assistente falhou o essencial, é agora.
      if ((registo.nota as number) <= 2 && p.peso >= 3) {
        await db.from("ai_incidents").insert({
          tipo: "MODEL_UNHEALTHY", severidade: p.peso >= 4 ? "crit" : "warn",
          titulo: `Qualidade: ${p.assistant_key} teve ${registo.nota}/5 em "${p.nome}"`,
          detalhe: { justificacao: registo.justificacao, falhas: registo.falhas },
        });
      }
    } catch (e) {
      registo.erro = String(e).slice(0, 300);
      await db.from("ai_avaliacoes").insert(registo);
      saida.push({ pergunta: p.nome, erro: registo.erro });
    }
  }

  const notas = saida.filter((x: any) => typeof x.nota === "number").map((x: any) => x.nota);
  return Response.json({
    avaliadas: saida.length,
    media: notas.length ? Number((notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(2)) : null,
    abaixo_de_3: notas.filter((n) => n < 3).length,
    resultados: saida,
  });
});
