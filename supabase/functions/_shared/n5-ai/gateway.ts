// =====================================================================
// N5 AI Gateway — orquestração
// ---------------------------------------------------------------------
// O caminho crítico e nada mais:
//   autenticar → resolver assistente → validar origem → limite de
//   tráfego → orçamento → escolher modelo são → montar prompt →
//   chamar fornecedor → STREAM.
//
// Tudo o que é contabilidade, saúde e classificação corre DEPOIS da
// resposta sair. O utilizador nunca espera por analítica.
//
// Portabilidade: só APIs Web. Quem injeta segredos e cria a resposta
// HTTP é o wrapper do runtime.
// =====================================================================

import type {
  AssistantRow, ChatRequest, ModelRow, N5Message, RequestClass, StreamEvent, AttemptRecord,
  TokenUsage,
} from "./types.ts";
import { Registry, originAllowed, type DbClient } from "./registry.ts";
import { Router, ROUTING_VERSION } from "./router.ts";
import { Budgets, PostgresRateLimiter, hashIp, type RateRule } from "./budgets.ts";
import { estimateCost } from "./providers/shared.ts";

/** Timeout por tentativa. Curto de propósito: falhar depressa e passar
 *  ao modelo seguinte é melhor do que pendurar o visitante 50s — foi
 *  isso que provocou os 504 de 21/08/2026. */
const TIMEOUT_TENTATIVA_MS = 12_000;

/** Pedidos com pesquisa web (diagnósticos) demoram muito mais: a Google
 *  vai à net, lê fontes e só depois escreve. As Edge Functions dão 400s
 *  de wall-clock em plano pago, por isso há folga de sobra. */
const TIMEOUT_GROUNDING_MS = 90_000;
/**
 * Escrever um relatório inteiro em JSON não se compara a responder num chat.
 * O Mapa de Oportunidade da Terrae passa dos 5000 tokens de saída e leva
 * minutos. Com o limite dos chats (12s) abortava sempre a meio — e o pedaço
 * já escrito era servido como se estivesse completo.
 */
const TIMEOUT_RELATORIO_MS = 240_000;

export type GatewayDeps = {
  db: DbClient;
  getEnv: (name: string) => string | undefined;
  /** Corre trabalho fora do caminho crítico (ex.: EdgeRuntime.waitUntil). */
  background: (p: Promise<unknown>) => void;
};

export type RequestContext = {
  origin: string | null;
  referer: string | null;
  ip: string | null;
  /**
   * Verdadeiro só quando o pedido traz a chave de serviço. Nenhum site a tem
   * — é a fronteira entre "veio da internet" e "veio de dentro". Hoje só
   * autoriza o ensaio (atravessar a 0%); qualquer poder futuro deste lado
   * deve continuar a depender dela, e nunca de um cabeçalho declarado.
   */
  isServiceRole?: boolean;
};

export class Gateway {
  private registry: Registry;
  private router: Router;
  private budgets: Budgets;
  private rateLimiter: PostgresRateLimiter;

  constructor(private readonly deps: GatewayDeps) {
    this.registry = new Registry(deps.db, deps.getEnv);
    this.router = new Router(deps.db, this.registry);
    this.budgets = new Budgets(deps.db);
    this.rateLimiter = new PostgresRateLimiter(deps.db);
  }

  /**
   * Devolve um ReadableStream de eventos SSE. Começa a emitir assim que
   * o primeiro token chega — é isto que mata o TTFT e o 504.
   */
  async handle(req: ChatRequest, ctx: RequestContext): Promise<Response> {
    const t0 = Date.now();
    const requestId = crypto.randomUUID();
    const traceId = crypto.randomUUID();

    // ---- 1. assistente (server-side; o browser só manda a chave pública)
    let assistant: AssistantRow | null = null;
    try {
      assistant = await this.registry.assistant(req.assistant_key);
    } catch (e) {
      return this.erroSSE(requestId, "registry_error", String(e));
    }
    if (!assistant) return this.erroSSE(requestId, "unknown_assistant", "Assistente não encontrado.");

    // ---- 2. origem (allowlist do registo, nunca o que o browser diz ser)
    if (!originAllowed(assistant, ctx.origin, ctx.referer)) {
      this.logAsync({
        request_id: requestId, trace_id: traceId, org_id: assistant.org_id,
        assistant_id: assistant.id, status: "blocked", error_code: "origin_denied",
        requested_class: "STANDARD", routing_reason: "n/a", routing_version: ROUTING_VERSION,
        fallback_used: false, attempt_chain: [], streamed: false,
        gateway_ms: Date.now() - t0,
      });
      return this.erroSSE(requestId, "origin_denied", "Origem não autorizada.");
    }

    // ---- 2b. rollout: é o GATEWAY que decide, não o site.
    // O site chama sempre; se este pedido não pertence à fatia migrada,
    // respondemos 'rollout_excluded' e o site serve pelo caminho antigo.
    // Assim a percentagem vive num só sítio (o registo), muda sem deploy,
    // e nenhum site precisa de ler a base de dados.
    //
    // ENSAIO: quem tem a chave de serviço pode atravessar a 0% sem abrir a
    // torneira a ninguém. Existe porque havia um impasse real — não se podia
    // provar um assistente sem primeiro o pôr em produção, que é exatamente
    // o que a migração progressiva quer evitar. Serve os casos delicados
    // (diagnósticos da Terrae) onde ver a resposta antes vale mais do que
    // uma fatia de 10%.
    //
    // A porta é a chave de serviço, nunca um cabeçalho qualquer: um site não
    // a tem, logo nenhum visitante consegue forçar caminho.
    const ensaio = ctx.isServiceRole === true && req.ensaio === true;

    if (!ensaio && (!assistant.gateway_enabled || assistant.traffic_percentage <= 0)) {
      return this.erroSSE(requestId, "rollout_excluded", "Fora da fatia migrada.");
    }
    if (!ensaio && assistant.traffic_percentage < 100) {
      // Balde estável por sessão/IP: um visitante não salta de caminho a
      // meio da conversa, e a comparação legacy vs gateway não fica suja.
      const semente = req.session_id ?? ctx.ip ?? crypto.randomUUID();
      const salt2 = this.deps.getEnv("N5_AI_IP_SALT") ?? "n5";
      const h = await hashIp(semente, salt2);
      const balde = parseInt(h.slice(0, 4), 16) % 100;
      if (balde >= assistant.traffic_percentage) {
        return this.erroSSE(requestId, "rollout_excluded", "Fora da fatia migrada.");
      }
    }

    // ---- 3. limites de tráfego (duráveis, partilhados entre instâncias)
    const salt = this.deps.getEnv("N5_AI_IP_SALT") ?? "n5";
    const regras: RateRule[] = [
      { scope: "assistant", key: assistant.id, limit: 600, windowSeconds: 60 },
    ];
    if (ctx.ip) {
      regras.unshift({ scope: "ip", key: await hashIp(ctx.ip, salt), limit: 20, windowSeconds: 60 });
    }
    if (req.session_id) {
      regras.push({ scope: "session", key: req.session_id, limit: 40, windowSeconds: 60 });
    }
    const rl = await this.rateLimiter.check(regras);
    if (!rl.allow) {
      this.logAsync({
        request_id: requestId, trace_id: traceId, org_id: assistant.org_id,
        assistant_id: assistant.id, status: "rate_limited", error_code: `rate:${rl.scope}`,
        requested_class: "STANDARD", routing_reason: "n/a", routing_version: ROUTING_VERSION,
        fallback_used: false, attempt_chain: [], streamed: false, gateway_ms: Date.now() - t0,
      });
      return this.erroSSE(requestId, "rate_limited", "Demasiados pedidos. Tenta daqui a pouco.");
    }

    // ---- 4. orçamento (pode forçar modelo mais barato em vez de bloquear)
    const orc = await this.budgets.check(assistant.org_id, assistant.id);
    if (!orc.allow) {
      this.logAsync({
        request_id: requestId, trace_id: traceId, org_id: assistant.org_id,
        assistant_id: assistant.id, status: "budget_exceeded", error_code: "budget",
        requested_class: "STANDARD", routing_reason: "n/a", routing_version: ROUTING_VERSION,
        fallback_used: false, attempt_chain: [], streamed: false, gateway_ms: Date.now() - t0,
      });
      return this.erroSSE(requestId, "budget_exceeded", "Serviço temporariamente indisponível.");
    }

    // ---- 5. classificar e rotear (determinístico — nenhum LLM decide)
    const cls = this.classify(req);
    let cadeia = await this.router.chain(assistant.routing_policy_id, cls);
    if (orc.forceModelId) {
      const barato = await this.registry.model(orc.forceModelId);
      if (barato) cadeia = [{ model: barato, role: "PRIMARY", reason: "budget:route_cheaper" }];
    }
    // O chamador pode EXIGIR pesquisa. A política define o comportamento por
    // omissão de cada classe; isto é para quem sabe que sem factos frescos a
    // resposta não presta — os diagnósticos da Terrae citam preços e zonas.
    //
    // Consequência: a cadeia encolhe aos modelos que sabem pesquisar (só os
    // do Google, hoje). Se nenhum estiver de pé, é melhor falhar aqui do que
    // servir números inventados com ar de relatório.
    // ...e pode DISPENSÁ-LA. A política dos relatórios liga a pesquisa em
    // todas as regras, mas o Mapa de Oportunidade tem um primeiro passo
    // deliberadamente rápido, sem pesquisa, para o visitante ver algo em
    // segundos. Sem esta recusa explícita, esse passo herdava a pesquisa da
    // política e demorava um minuto — deixava de ser o passo rápido.
    if (req.grounding === false) {
      cadeia = cadeia.map((c) => ({ ...c, grounding: false }));
    }
    if (req.grounding === true) {
      const comPesquisa = cadeia.filter((c) => (c.model as any).supports_grounding);
      if (comPesquisa.length === 0) {
        this.incidenteAsync("MODEL_UNHEALTHY", "crit", "Pediu-se pesquisa e nenhum modelo a suporta", assistant);
        return this.erroSSE(requestId, "no_model", "Sem modelo com pesquisa disponível.");
      }
      cadeia = comPesquisa.map((c) => ({ ...c, grounding: true }));
    }

    if (cadeia.length === 0) {
      this.incidenteAsync("MODEL_UNHEALTHY", "crit", "Sem modelos disponíveis para routing", assistant);
      return this.erroSSE(requestId, "no_model", "Sem modelo disponível.");
    }

    // ---- 6. montar o pedido (prompt do registo, nunca do browser)
    const mensagens = this.trim(req.messages, assistant);

    // System: do registo por omissao. So aceita o do chamador se ESTE
    // assistente o permitir — quem controla o system controla o
    // assistente, por isso nao e um poder geral.
    const querSystem = typeof req.system === "string" && req.system.trim().length > 0;
    const systemDinamico = querSystem && !!(assistant as any).permite_system_dinamico;
    if (querSystem && !systemDinamico) {
      return this.erroSSE(requestId, "system_nao_permitido",
        "Este assistente nao aceita system do chamador.");
    }
    // Quando existem os dois, COMPÕEM-SE, com o do registo à frente. Não é
    // arrumação: é o que faz o caching funcionar.
    //
    // Os fornecedores cacheiam PREFIXOS byte a byte. Um prefixo estável e
    // longo custa quase nada a repetir; um que mude a cada pedido paga
    // sempre preço inteiro. Medido no Joaquim da Terrae, 36 mil tokens de
    // system: $0,0032 com cache contra $0,0277 sem — 8,7 vezes.
    //
    // Por isso a persona (estável, nossa, no registo) vai primeiro e a
    // parte variável do site (currículo, aula, catálogo) vem depois. Ao
    // contrário, a parte que muda envenenava o prefixo e ninguém
    // aproveitaria o cache.
    const doRegisto = await this.systemPrompt(assistant);
    const doChamador = systemDinamico ? req.system!.trim() : "";
    const system = doRegisto && doChamador
      ? doRegisto + "\n\n" + doChamador
      : (doChamador || doRegisto);

    // JSON: idem — so se o assistente estiver marcado para isso.
    const querJson = req.response_format === "json";
    if (querJson && !(assistant as any).permite_json) {
      return this.erroSSE(requestId, "json_nao_permitido",
        "Este assistente nao aceita saida estruturada.");
    }

    // ---- 7. executar com streaming e fallback silencioso
    const gatewayMs = Date.now() - t0;
    return this.executar({
      requestId, traceId, assistant, cadeia, mensagens, system, cls, gatewayMs, t0,
      jsonMode: querJson, systemDinamico, tetoPedido: req.max_output_tokens,
      passosInvestigacao: req.passos_investigacao,
    });
  }

  // -------------------------------------------------------------------

  /**
   * Ângulos da investigação, por ordem.
   *
   * Uma só passagem de pesquisa não chega para avaliar uma casa. O modelo
   * faz uma busca, encontra meia dúzia de anúncios e responde — e anúncios
   * são PEDIDOS, não vendas: em Portugal fecham tipicamente abaixo do que
   * pedem. Um relatório assente só neles sobrevaloriza de forma sistemática.
   *
   * Por isso cada passagem procura outra coisa, e a última procura o que
   * DESMENTE as anteriores. Um número que sobrevive a ser contrariado vale
   * muito mais do que um número que nunca foi posto à prova.
   */
  private static readonly ANGULOS = [
    "Procura os valores PEDIDOS em anúncios atuais para este caso concreto. "
    + "Diz quantos anúncios viste e a dispersão entre eles.",

    "Agora procura dados OFICIAIS e de transações concluídas — INE, Confidencial "
    + "Imobiliário, portais com histórico de vendas — e a evolução dos últimos 12 meses. "
    + "Nota a diferença entre o que se pede e o que se fecha.",

    "Agora procura o que CONTRADIZ o que já apuraste: valores destoantes, "
    + "diferenças entre freguesias ou ruas, estado de conservação, andar, "
    + "elevador, estacionamento, ruído, obras previstas. Se algo enfraquecer "
    + "a conclusão anterior, di-lo claramente.",

    "Última verificação: procura o que falta para esta avaliação ser defensável "
    + "perante um proprietário exigente. Aponta o que ficou por confirmar.",
  ];

  /**
   * Investigação dos relatórios: pesquisa em prosa, em várias passagens.
   *
   * Devolve o system e as mensagens já preparados para o passo de formatar
   * em JSON, ou null se não conseguiu pesquisar — nesse caso quem chama
   * segue pelo caminho normal, sem fontes mas com relatório.
   */
  private async investigar(a: {
    cadeia: { model: ModelRow; grounding?: boolean; temperature?: number | null }[];
    mensagens: N5Message[]; system: string; assistant: AssistantRow; passos?: number;
    /**
     * Dá sinal de vida a cada passagem. Não é enfeite: a ligação fica
     * INATIVA enquanto se investiga, e o Supabase corta às 150 segundos.
     * Com quatro passagens passa-se disso à vontade — e o cliente recebia
     * uma resposta vazia, sem sequer um erro, ao fim de 151s.
     */
    sinal?: (passo: number, total: number, fontes: number) => void;
  }): Promise<
    { system: string; mensagens: N5Message[]; usou: boolean; fontes: number; usage?: TokenUsage }
    | null
  > {
    const passo1 = a.cadeia.find((c) => (c.model as any).supports_grounding);
    if (!passo1) return null;

    const pergunta = [...a.mensagens].reverse().find((m) => m.role === "user")?.content;
    if (!pergunta) return null;

    let provider;
    try { provider = await this.registry.providerFor(passo1.model.provider_id); } catch { return null; }

    // O system da investigação é deliberadamente CURTO e sem uma palavra
    // sobre formato: qualquer instrução de JSON aqui volta a desligar a
    // pesquisa. O system do assistente entra só como enquadramento.
    const sysInvestigar =
      "És um analista rigoroso. Pesquisa no Google e responde em prosa, citando o que encontraste. " +
      "Nunca indiques um valor que não tenhas visto na pesquisa; se não encontrares, di-lo. " +
      "Não uses JSON nem formatação estruturada.\n\nContexto do trabalho:\n" +
      a.system.slice(0, 4000);

    const passos = Math.max(1, Math.min(a.passos ?? 1, Gateway.ANGULOS.length));
    const apurado: string[] = [];
    const fontesTodas = new Set<string>();
    let usou = false;
    const soma: TokenUsage = { input: 0, output: 0, cached: 0 };

    for (let p = 0; p < passos; p++) {
      // Cada passagem vê o que as anteriores apuraram — é isso que permite
      // à última contrariar as outras em vez de repetir a mesma busca.
      const anterior = apurado.length
        ? "JÁ APURASTE:\n" + apurado.join("\n\n---\n\n") + "\n\n"
        : "";
      const instrucao = passos > 1 ? "\n\nNESTA PASSAGEM: " + Gateway.ANGULOS[p] : "";

      let r;
      try {
        r = await provider.generate({
          model: passo1.model.provider_model_id,
          system: sysInvestigar,
          messages: [{ role: "user", content: anterior + "PEDIDO:\n" + pergunta + instrucao }],
          maxOutputTokens: 4000,
          temperature: 0.3,
          grounding: true,
          jsonMode: false,
          tokenHeadroom: 6000,
          timeoutMs: TIMEOUT_GROUNDING_MS,
        });
      } catch { break; }

      if (!r.ok || !r.text.trim()) break;   // fica-se com o que já se apurou

      apurado.push(r.text.trim());
      for (const u of r.groundingUris ?? []) fontesTodas.add(u);
      if (r.groundingUsed) usou = true;
      a.sinal?.(p + 1, passos, fontesTodas.size);
      soma.input = (soma.input ?? 0) + (r.usage?.input ?? 0);
      soma.output = (soma.output ?? 0) + (r.usage?.output ?? 0);
      soma.cached = (soma.cached ?? 0) + (r.usage?.cached ?? 0);
    }

    if (!apurado.length) return null;

    const fontes = [...fontesTodas];
    // O passo de formatar recebe os factos e SÓ as fontes reais. Sem esta
    // lista explícita, o modelo enche o campo `fontes` com nomes plausíveis.
    const contexto =
      "APURADO NA PESQUISA" + (apurado.length > 1 ? ` (${apurado.length} passagens)` : "") + ":\n" +
      apurado.join("\n\n---\n\n") +
      (fontes.length
        ? "\n\nFONTES REAIS (usa exclusivamente estas; não acrescentes nenhuma):\n" + fontes.join("\n")
        : "\n\n(A pesquisa não devolveu fontes. Deixa o campo de fontes vazio e baixa a confiança.)") +
      "\n\nREGRA: se as passagens divergirem, a confiança NÃO pode ser alta e o " +
      "intervalo tem de cobrir a divergência. Vale mais um intervalo largo e " +
      "honesto do que um número estreito e errado.\n\nPEDIDO ORIGINAL:\n" + pergunta;

    return {
      system: a.system,
      mensagens: [{ role: "user", content: contexto }],
      usou,
      fontes: fontes.length,
      // Os tokens de TODAS as passagens contam. Sem isto o painel diria que
      // um relatório custa uma fração do que custa — e um custo subestimado
      // é a razão por que ninguém percebe a fatura ao fim do mês.
      usage: soma,
    };
  }

  private async executar(a: {
    requestId: string; traceId: string; assistant: AssistantRow;
    cadeia: { model: ModelRow; role: string; reason: string; grounding?: boolean }[];
    mensagens: N5Message[]; system: string; cls: RequestClass;
    gatewayMs: number; t0: number;
    jsonMode: boolean; systemDinamico: boolean; tetoPedido?: number;
    passosInvestigacao?: number;
  }): Promise<Response> {
    const enc = new TextEncoder();
    const self = this;
    const tentativas: AttemptRecord[] = [];

    const stream = new ReadableStream({
      async start(controller) {
        const send = (ev: StreamEvent) =>
          controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));

        send({ type: "start", request_id: a.requestId });

        let ttft: number | undefined;
        let usado: ModelRow | null = null;
        let texto = "";
        let usage: { input?: number; output?: number; cached?: number } | undefined;
        let motivo = "";
        let fallback = false;
        let groundingPedido = false;
        let groundingReal = false;
        let fontesUsadas = 0;
        let usagePesquisa: TokenUsage | undefined;

        // ---- INVESTIGAR ANTES DE FORMATAR -------------------------------
        //
        // Pedir JSON e pedir pesquisa ao mesmo tempo não funciona. Medido
        // contra a API a 22/08/2026, no gemini-pro-latest: com a instrução
        // "responde só com JSON", o modelo NÃO chega a pesquisar — devolve
        // JSON impecável, com valores de memória e nomes de fontes que
        // inventou ("Prime Imobiliária", "Properstar"). Três formulações
        // diferentes do prompt deram todas zero fontes reais. Não é um
        // prompt mal escrito: é o comportamento do modelo.
        //
        // É a avaria mais perigosa que este sistema pode ter — um relatório
        // com preços inventados lê-se exatamente como um verdadeiro. Já
        // aconteceu em produção (ver a nota da Segunda Opinião no site).
        //
        // Por isso separam-se os dois trabalhos:
        //   1. investigar — pergunta em prosa, com pesquisa, sem JSON;
        //   2. formatar   — converter em JSON o que a pesquisa trouxe.
        //
        // Custa uma chamada a mais. Um relatório inventado custa um cliente.
        if (a.jsonMode && a.cadeia.some((c) => c.grounding)) {
          // Pulsar DURANTE, não só entre passagens: uma passagem sozinha pode
          // levar mais de 150s (o modelo principal chega a gastar 78s só para
          // devolver um 503) e é aos 150s que o Supabase corta a ligação.
          let ultimo = { passo: 0, total: a.passosInvestigacao ?? 1, fontes: 0 };
          const pulsar = setInterval(
            () => send({ type: "progress", data: { fase: "pesquisa", ...ultimo } }),
            25_000,
          );
          let pesquisa;
          try {
            pesquisa = await self.investigar({
              ...a,
              passos: a.passosInvestigacao,
              sinal: (passo, total, fontes) => {
                ultimo = { passo, total, fontes };
                send({ type: "progress", data: { fase: "pesquisa", passo, total, fontes } });
              },
            });
          } finally {
            clearInterval(pulsar);
          }
          if (pesquisa) {
            a.system = pesquisa.system;
            a.mensagens = pesquisa.mensagens;
            groundingPedido = true;
            groundingReal = pesquisa.usou;
            fontesUsadas = pesquisa.fontes;
            usagePesquisa = pesquisa.usage;
            // O passo 2 não pesquisa: já tem os factos e a pesquisa só o
            // faria voltar a ignorar o pedido de JSON.
            a.cadeia = a.cadeia.map((c) => ({ ...c, grounding: false }));
          }
          // Se a investigação falhar, seguimos como antes: melhor um
          // relatório sem fontes — e assinalado como tal — do que nenhum.
        }

        for (let i = 0; i < a.cadeia.length; i++) {
          const { model, role, reason, maxOutputTokens, grounding, temperature, tokenHeadroom } =
            a.cadeia[i];
          const tTent = Date.now();
          let provider;
          try {
            provider = await self.registry.providerFor(model.provider_id);
          } catch (e) {
            tentativas.push({
              provider_id: model.provider_id, provider_model_id: model.provider_model_id,
              role, status: 0, kind: "permanent", latency_ms: 0, error_code: "provider_init",
            });
            continue;
          }

          try {
            // A regra de routing manda sobre o assistente: uma classe de
            // diagnóstico precisa de mais tokens e de pesquisa do que o
            // teto genérico do assistente permite.
            const opcoes = {
              model: model.provider_model_id,
              system: a.system,
              messages: a.mensagens,
              maxOutputTokens: Math.min(
                a.tetoPedido ?? maxOutputTokens ?? a.assistant.max_output_tokens,
                maxOutputTokens ?? a.assistant.max_output_tokens,
              ),
              jsonMode: a.jsonMode,
              temperature: temperature ?? Number(a.assistant.temperature),
              grounding,
              tokenHeadroom,
              // 12s chega a um chat. Não chega a escrever um relatório: a
              // formatação de um Mapa de Oportunidade leva minutos, abortava
              // a meio, e o pedaço já escrito era servido como se estivesse
              // completo.
              timeoutMs: (grounding || a.jsonMode) ? TIMEOUT_RELATORIO_MS : TIMEOUT_TENTATIVA_MS,
            };

            let deuAlgo = false;
            let final;

            if (a.jsonMode) {
              // ---- RELATÓRIOS: de uma vez, nunca aos pedaços -------------
              //
              // Streaming e fallback não se dão. Se um modelo falha a meio,
              // já enviámos metade da resposta dele — e o modelo seguinte
              // começa do princípio, ficando as duas coladas. Foi exatamente
              // isso que se mediu: um JSON com 77 chavetas abertas e 74
              // fechadas, dois relatórios parciais um a seguir ao outro, que
              // o motor da Terrae rejeitava.
              //
              // Um relatório não é lido enquanto escorre; é lido no fim. Por
              // isso pede-se inteiro: se falhar, ninguém viu nada e o modelo
              // seguinte pode tentar de verdade.
              //
              // Enquanto o modelo escreve não sai um byte, e o Supabase corta
              // ligações inativas às 150 segundos. A escrita de um relatório
              // passa disso à vontade — ainda mais quando o modelo principal
              // gasta 78s a devolver um 503 antes de se cair no seguinte. Sem
              // este sinal, o site recebia uma ligação morta e caía no
              // caminho antigo, que também estava em 503: o visitante ficava
              // sem relatório nenhum e nada explicava porquê.
              const pulsar = setInterval(
                () => send({ type: "progress", data: { fase: "escrita", passo: 1, total: 1, fontes: fontesUsadas } }),
                25_000,
              );
              try {
                final = await provider.generate(opcoes);
              } finally {
                clearInterval(pulsar);
              }
              if (final.ok && final.text) {
                ttft = ttft ?? Date.now() - a.t0;
                deuAlgo = true;
                texto += final.text;
                send({ type: "delta", text: final.text });
              }
            } else {
              const it = provider.stream(opcoes);
              let res = await it.next();
              while (!res.done) {
                const chunk = res.value;
                if (chunk.type === "delta") {
                  if (ttft === undefined) ttft = Date.now() - a.t0;
                  deuAlgo = true;
                  texto += chunk.text;
                  send({ type: "delta", text: chunk.text });
                } else if (chunk.type === "usage") {
                  usage = chunk.usage;
                }
                res = await it.next();
              }
              final = res.value;
            }

            tentativas.push({
              provider_id: model.provider_id, provider_model_id: model.provider_model_id,
              role, status: final.status, kind: final.kind,
              latency_ms: Date.now() - tTent, error_code: final.errorCode,
            });
            self.deps.background(
              self.router.record(model, final.ok, final.status, Date.now() - tTent, ttft),
            );

            if (final.ok && (deuAlgo || final.text)) {
              usado = model;
              // Num relatório em dois passos, quem pesquisou foi o passo 1 —
              // este só formata. Sobrepor aqui apagaria o registo da
              // pesquisa e o painel diria que nunca se pesquisou.
              if (!groundingPedido) {
                groundingPedido = !!grounding;
                groundingReal = !!final.groundingUsed;
                fontesUsadas = final.groundingSources ?? 0;
              }
              motivo = reason;
              fallback = i > 0;
              if (!usage && final.usage) usage = final.usage;
              break;
            }
            // Falhou DEPOIS de já ter enviado texto: não se pode trocar de
            // modelo aqui. O visitante já leu meia resposta e o modelo
            // seguinte começaria do princípio — ficariam as duas coladas,
            // que foi como um relatório saiu com 77 chavetas abertas e 74
            // fechadas. Mais vale parar e deixar o site servir pelo caminho
            // dele do que entregar uma resposta remendada.
            if (deuAlgo) {
              send({ type: "error", code: "corte_a_meio", message: "Resposta interrompida." });
              break;
            }
            // falhou sem ter enviado nada: o modelo seguinte pode tentar
            // limpo, e ninguém deu por isso.
          } catch (e) {
            tentativas.push({
              provider_id: model.provider_id, provider_model_id: model.provider_model_id,
              role, status: 0, kind: "transient", latency_ms: Date.now() - tTent,
              error_code: "exception",
            });
            self.deps.background(self.router.record(model, false, 0));
          }
        }

        const total = Date.now() - a.t0;

        if (!usado) {
          send({ type: "error", code: "all_providers_failed", message: "Não consegui responder agora." });
          controller.close();
          self.logAsync({
            request_id: a.requestId, trace_id: a.traceId, org_id: a.assistant.org_id,
            assistant_id: a.assistant.id, requested_class: a.cls,
            routing_reason: "exhausted", routing_version: ROUTING_VERSION,
            fallback_used: true, fallback_reason: "all_failed",
            attempt_chain: tentativas, status: "error", error_code: "all_providers_failed",
            total_latency_ms: total, gateway_ms: a.gatewayMs, streamed: true,
          });
          self.incidenteAsync("HIGH_ERROR_RATE", "crit",
            "Toda a cadeia de modelos falhou", a.assistant);
          return;
        }

        // Metadados úteis ao cliente — sem revelar fornecedor nem prompt.
        send({ type: "metadata", data: { request_id: a.requestId, fallback_used: fallback, ttft_ms: ttft } });
        send({ type: "done" });
        controller.close();

        // ---- fora do caminho crítico
        //
        // Um relatório são DOIS pedidos ao modelo (investigar + formatar).
        // O que fica registado tem de ser a soma: senão o painel mostra
        // metade do custo real e a fatura no fim do mês não bate com nada.
        const usageTotal: TokenUsage | undefined = usagePesquisa
          ? {
            input: (usage?.input ?? 0) + (usagePesquisa.input ?? 0),
            output: (usage?.output ?? 0) + (usagePesquisa.output ?? 0),
            cached: (usage?.cached ?? 0) + (usagePesquisa.cached ?? 0),
          }
          : usage;
        const custo = estimateCost(usageTotal, {
          input_cost: usado.input_cost, output_cost: usado.output_cost,
          cached_input_cost: usado.cached_input_cost,
        });
        self.logAsync({
          request_id: a.requestId, trace_id: a.traceId, org_id: a.assistant.org_id,
          assistant_id: a.assistant.id, requested_class: a.cls,
          provider_id: usado.provider_id, model_id: usado.id,
          provider_model_id: usado.provider_model_id,
          routing_reason: motivo, routing_version: ROUTING_VERSION,
          fallback_used: fallback,
          fallback_reason: fallback ? tentativas[0]?.error_code : undefined,
          attempt_chain: tentativas,
          input_tokens: usageTotal?.input, output_tokens: usageTotal?.output, cached_tokens: usageTotal?.cached,
          estimated_cost: custo, ttft_ms: ttft, total_latency_ms: total,
          grounding_pedido: groundingPedido, grounding_usado: groundingReal, grounding_fontes: fontesUsadas,
          json_mode: a.jsonMode, system_dinamico: a.systemDinamico,
          gateway_ms: a.gatewayMs, status: "ok", streamed: true,
        });
        if (custo) self.deps.background(self.budgets.commit(a.assistant.org_id, a.assistant.id, custo));
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-store",
        "connection": "keep-alive",
        "x-request-id": a.requestId,
      },
    });
  }

  // -------------------------------------------------------------------
  // Auxiliares
  // -------------------------------------------------------------------

  /** P0: classificação barata por heurística. Sem LLM a decidir. */
  private classify(req: ChatRequest): RequestClass {
    if (req.hint_class && req.hint_class !== "STATIC") return req.hint_class;
    const ultima = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const n = ultima.trim().length;
    if (n <= 30) return "SIMPLE";
    if (n > 600) return "COMPLEX";
    return "STANDARD";
  }

  /** Corta o histórico ao âmbito configurado do assistente. */
  private trim(msgs: N5Message[], a: AssistantRow): N5Message[] {
    return msgs
      .filter((m) => m && typeof m.content === "string" && m.content.trim())
      .slice(-a.max_messages)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content.slice(0, a.max_chars_message),
      }));
  }

  /**
   * P0: o prompt vem da coluna do assistente. Em P1 passa a vir de
   * ai_prompts/ai_prompt_versions com versionamento e rollback.
   */
  private async systemPrompt(a: AssistantRow): Promise<string> {
    // system_prompt, NUNCA descricao. A `descricao` é a nota interna da
    // equipa; enviá-la ao modelo foi o bug que fez o piloto responder
    // sem personalidade e em pt-BR.
    const { data } = await this.deps.db
      .from("ai_assistants").select("system_prompt").eq("id", a.id).maybeSingle();
    return (data?.system_prompt ?? "").trim();
  }

  private logAsync(log: Record<string, unknown>) {
    this.deps.background(
      (async () => {
        try { await this.deps.db.from("ai_requests").insert(log); } catch { /* nunca derruba */ }
      })(),
    );
  }

  private incidenteAsync(tipo: string, sev: string, titulo: string, a: AssistantRow) {
    this.deps.background(
      (async () => {
        try {
          await this.deps.db.from("ai_incidents").insert({
            tipo, severidade: sev, titulo, org_id: a.org_id, assistant_id: a.id,
          });
        } catch { /* idem */ }
      })(),
    );
  }

  /** Erro em formato SSE, para o cliente ter sempre o mesmo contrato. */
  private erroSSE(requestId: string, code: string, message: string): Response {
    const enc = new TextEncoder();
    const body = [
      `data: ${JSON.stringify({ type: "start", request_id: requestId })}\n\n`,
      `data: ${JSON.stringify({ type: "error", code, message })}\n\n`,
    ].join("");
    return new Response(enc.encode(body), {
      status: 200, // o erro vai NO stream; o transporte está bem
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-store",
        "x-request-id": requestId,
      },
    });
  }
}
