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

  // QUANTAS POR CORRIDA — o teto dos 150s manda, não a nossa vontade.
  //
  // Cada pergunta são duas chamadas a modelos: uma para responder, outra
  // para julgar. Com 21 perguntas são 42 chamadas, e o Supabase corta a
  // ligação aos 150s de inatividade. A corrida das 10:43 tinha 8
  // perguntas e só deixou 6 avaliações — já vinha a ser cortada a meio, e
  // nada o dizia: víamos as notas que chegaram e não as que faltavam.
  //
  // Em vez de tentar caber tudo, faz-se por lotes e começa-se pelas MAIS
  // ANTIGAS. Assim uma corrida diária cobre a bateria toda em poucos
  // dias, sozinha, e nenhuma pergunta fica eternamente por avaliar
  // porque calhou estar no fim da lista.
  const url = new URL(req.url);
  const quantas = Math.max(1, Math.min(Number(url.searchParams.get("quantas")) || 6, 40));

  // Quando cada pergunta foi avaliada pela última vez. Sem avaliação
  // nenhuma vai à frente de todas — é o caso das que acabaram de nascer.
  const { data: ultimas } = await db
    .from("ai_avaliacoes").select("pergunta_id, correu_em")
    .order("correu_em", { ascending: false });
  const visto = new Map<string, string>();
  for (const a of ultimas ?? []) {
    if (!visto.has(a.pergunta_id)) visto.set(a.pergunta_id, a.correu_em);
  }

  const { data: todas } = await db
    .from("ai_perguntas_referencia").select("*").eq("ativo", true);

  // CADÊNCIA CONFORME O PESO — nem tudo precisa de ser visto todos os dias.
  //
  // Uma regra dura («não diz preços», «não faz alegações de saúde») tem de
  // ser verificada todos os dias: se partir, parte hoje e custa hoje.
  //
  // Uma questão de tom não muda de um dia para o outro, e verificá-la
  // diariamente é pagar 365 vezes por ano para confirmar o que já se
  // sabia. Semanal chega, e a tendência continua a ver-se.
  //
  // Determinístico: depende do dia, não do acaso. Duas corridas no mesmo
  // dia avaliam o mesmo conjunto, e é isso que permite comparar.
  const dia = Math.floor(Date.now() / 86_400_000);
  const devidoHoje = (peso: number) =>
    peso >= 5 ? true : (peso === 4 ? dia % 2 === 0 : dia % 7 === 0);

  const perguntas = (todas ?? [])
    .filter((p) => devidoHoje(p.peso ?? 3))
    .sort((a, b) => {
      const va = visto.get(a.id) ?? "";   // nunca avaliada ordena primeiro
      const vb = visto.get(b.id) ?? "";
      // Em empate, o peso decide: uma regra dura vale mais do que uma
      // afinação de tom.
      return va.localeCompare(vb) || (b.peso ?? 0) - (a.peso ?? 0);
    })
    .slice(0, quantas);

  // As perguntas sao independentes: correm em PARALELO, em lotes.
  //
  // Em serie, oito perguntas levavam mais de 300s (cada uma sao duas
  // chamadas a modelos) e nao cabiam no prazo do agendador - so tres
  // chegavam ao fim. Em lotes de tres, cabem com folga e nao se martela
  // nenhum fornecedor.
  const LOTE = 3;
  const saida: unknown[] = [];

  async function avaliar(p: any) {
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
          return;
        }

        // Que modelo respondeu — é isso que decide quem pode julgar.
        //
        // O registo do pedido é escrito DEPOIS de o fluxo fechar, em segundo
        // plano. Ler já a seguir apanha-o a meio e fica sem modelo: na
        // primeira corrida, duas avaliações ficaram sem saber quem tinha
        // respondido, e sem isso não se pode garantir que o juiz é de outra
        // casa. Dá-se-lhe tempo, e tenta-se de novo.
        let pedido: any = null;
        for (let tenta = 0; tenta < 3 && r.requestId && !pedido; tenta++) {
          if (tenta) await new Promise((s) => setTimeout(s, 1500));
          const { data } = await db.from("ai_requests")
            .select("provider_id, provider_model_id, estimated_cost")
            .eq("request_id", r.requestId).maybeSingle();
          pedido = data;
        }

        registo = {
          ...registo,
          modelo_resposta: pedido?.provider_model_id ?? null,
          resposta: r.texto.slice(0, 8000),
          latencia_ms: r.ms,
          custo_usd: pedido?.estimated_cost ?? null,
        };

        // ---- 2. o juiz, obrigatoriamente de outra CASA
        //
        // Não basta olhar ao `provider_id`: esse é a ROTA, não a origem do
        // modelo. O `global.openai.gpt-5.6-terra` chega pelo Bedrock mas é um
        // modelo da OpenAI — pô-lo a julgar um `gpt-5.4-mini` é a mesma casa
        // a dar-se nota, que é exatamente o que esta regra veio evitar.
        // Aconteceu na primeira corrida.
        const casaDe = (m: string) =>
          /gemini/i.test(m) ? "google"
          : /gpt|openai/i.test(m) ? "openai"
          : /claude/i.test(m) ? "anthropic"
          : "outra";

        const casaDaResposta = casaDe(pedido?.provider_model_id ?? "");
        const { data: candidatos } = await db
          .from("ai_models")
          .select("provider_id, provider_model_id")
          .eq("status", "ACTIVE")
          // O JUIZ CUSTA CONFORME O QUE ESTÁ EM JOGO.
          //
          // Julgar é trabalho difícil e o modelo caro julga melhor — por
          // isso as REGRAS DURAS (peso 5) continuam a ter o melhor juiz
          // disponível. Um veredicto errado sobre «não faz alegações de
          // saúde» custa mais do que os cêntimos que se poupavam.
          //
          // Nas outras — tom, utilidade, ensinar em vez de despachar —
          // um engano do juiz custa uma afinação desnecessária, e não
          // vale seis vezes o preço. O mais barato de outra casa chega.
          .order("input_cost", { ascending: (p.peso ?? 3) < 5 });

        const juiz = (candidatos ?? []).find((m) => casaDe(m.provider_model_id) !== casaDaResposta);
        if (!juiz) {
          registo.erro = "sem juiz de outro fornecedor disponível";
          await db.from("ai_avaliacoes").insert(registo);
          saida.push({ pergunta: p.nome, erro: registo.erro });
          return;
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
          return;
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
            // QUALITY_LOW, não MODEL_UNHEALTHY: um prompt a falhar um
            // critério não é um modelo doente. Misturá-los foi o que
            // tornou a fila ilegível — 29 notas de qualidade a enterrar
            // 10 avarias a sério, e ninguém a ler nenhuma das duas.
            tipo: "QUALITY_LOW", severidade: p.peso >= 4 ? "crit" : "warn",
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

  const lista = perguntas ?? [];
  for (let i = 0; i < lista.length; i += LOTE) {
    await Promise.all(lista.slice(i, i + LOTE).map((p) =>
      // Um erro aqui não pode desaparecer: engolir a exceção fazia uma
      // pergunta sumir da corrida sem deixar rasto, e ficava a parecer que
      // nunca tinha sido feita. Grava-se o motivo como qualquer outra
      // falha, para se poder ver o que aconteceu.
      avaliar(p).catch(async (e) => {
        const motivo = String(e?.message ?? e).slice(0, 300);
        await db.from("ai_avaliacoes").insert({ pergunta_id: p.id, erro: motivo });
        saida.push({ pergunta: p.nome, erro: motivo });
      })));
  }

  const notas = saida.filter((x: any) => typeof x.nota === "number").map((x: any) => x.nota);
  return Response.json({
    avaliadas: saida.length,
    // Quantas ficaram por avaliar nesta corrida. Sem este número, ver seis
    // notas boas dava a sensação de estar tudo verificado — e foi
    // exatamente o que aconteceu às 10:43, com duas perguntas cortadas a
    // meio sem ninguém saber.
    por_avaliar: Math.max(0, (todas ?? []).length - perguntas.length),
    total_ativas: (todas ?? []).length,
    media: notas.length ? Number((notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(2)) : null,
    abaixo_de_3: notas.filter((n) => n < 3).length,
    resultados: saida,
  });
});
