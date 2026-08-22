// =====================================================================
// N5 AI OS · tipos do core
// ---------------------------------------------------------------------
// REGRA DE PORTABILIDADE: este módulo (e todo o /core) usa APENAS APIs
// Web standard — fetch, ReadableStream, TextEncoder, AbortController.
// Nada de Deno.*, process.*, node:*. O que é específico do runtime vive
// só no wrapper (supabase/functions/ai-chat/index.ts).
// Isto é o que permite mover o gateway para container/AWS/Workers sem
// reescrever o produto.
// =====================================================================

/** Mensagem no formato canónico do N5. Os adaptadores traduzem daqui. */
export type N5Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

/** Classes de pedido. O router escolhe o modelo a partir disto. */
export type RequestClass =
  | "STATIC"
  | "FAQ"
  | "SIMPLE"
  | "STANDARD"
  | "COMPLEX"
  | "HIGH_VALUE_COMMERCIAL"
  | "RISKY";

/** O contrato público, versionado. É isto que os sites enviam. */
export type ChatRequest = {
  assistant_key: string;
  session_id?: string;
  messages: N5Message[];
  /** Sugestão do cliente; o servidor pode ignorar. Nunca escolhe modelo. */
  hint_class?: RequestClass;
  metadata?: Record<string, unknown>;
  lang?: string;
  /**
   * Pede saída em JSON. Só honrado se o assistente tiver `permite_json`.
   * Sem isto, modos de avaliação/diagnóstico devolvem prosa e o
   * JSON.parse do chamador rebenta.
   */
  response_format?: "text" | "json";
  /**
   * System prompt vindo do chamador, para assistentes cujo prompt é
   * gerado a partir de dados (ex.: cenários da Academia).
   * ⚠️ Quem controla o system controla o assistente. Só é aceite se
   * `permite_system_dinamico` estiver ligado NESSE assistente — e a
   * chamada continua a passar pela allowlist de origem.
   */
  system?: string;
  /** Teto de saída pedido pelo chamador; limitado pelo do assistente. */
  max_output_tokens?: number;
  /**
   * Pede pesquisa no Google (grounding). O router passa a exigir modelos com
   * essa capacidade — hoje só os do Google a têm.
   *
   * Pedir não é usar: o modelo decide se pesquisa. `ai_grounding_falhado`
   * mostra os casos em que se pediu e ele respondeu de memória.
   */
  grounding?: boolean;
  /**
   * Quantas passagens de pesquisa antes de formatar (1 a 4). Só conta em
   * pedidos com `grounding` e saída em JSON.
   *
   * Uma passagem chega para "quanto custa o m² nesta zona". Não chega para
   * avaliar uma casa: a primeira busca traz anúncios, e anúncios são o que
   * se PEDE, não o que se fecha. As passagens seguintes procuram dados
   * oficiais, depois o que contradiz o apurado. Custa tempo e dinheiro;
   * um valor errado numa avaliação custa a confiança do proprietário.
   */
  passos_investigacao?: number;
  /**
   * ENSAIO. Atravessa a fatia de rollout (mesmo a 0%) para provar um
   * assistente antes de lhe abrir tráfego. Só vale com a chave de serviço;
   * de um site é ignorado.
   */
  ensaio?: boolean;
};

/** Eventos do stream. Contrato simples e estável. */
export type StreamEvent =
  | { type: "start"; request_id: string }
  | { type: "delta"; text: string }
  /**
   * Sinal de vida durante a investigação dos relatórios.
   *
   * Existe por necessidade, não por vaidade: enquanto se pesquisa não sai
   * um único byte, e o Supabase corta ligações inativas às 150 segundos.
   * Uma avaliação com quatro passagens passa disso e o cliente recebia
   * resposta vazia, sem sequer um erro.
   *
   * Quem lê o fluxo ignora eventos que não conheça — só os `delta` contam
   * para o texto. Mas dá jeito mostrar "a pesquisar (2 de 4)".
   */
  | { type: "progress"; data: { fase: string; passo: number; total: number; fontes: number } }
  | { type: "metadata"; data: ResponseMetadata }
  | { type: "done"; finish_reason?: string }
  /**
   * `terminal: true` significa: **não sirvas por outro caminho.**
   *
   * A recusa foi uma decisão nossa (rate limit, orçamento, origem,
   * política) e não uma avaria. Um site que caia para o caminho antigo
   * nestes casos está a contornar a própria proteção que acabou de o
   * barrar — servia o mesmo pedido por uma porta sem rate limit, sem
   * orçamento e sem allowlist.
   *
   * `terminal: false` é uma avaria nossa (sem modelo, fornecedores em
   * baixo) ou simplesmente «este pedido não é meu» (rollout). Aí o site
   * deve mesmo servir pelo caminho dele.
   */
  | { type: "error"; code: string; message: string; terminal?: boolean };

/** O que revelamos ao cliente sobre a execução. Nunca o prompt de sistema. */
export type ResponseMetadata = {
  request_id: string;
  /** Deliberadamente NÃO expomos provider/model ao browser por defeito. */
  model?: string;
  fallback_used?: boolean;
  ttft_ms?: number;
};

// ---------------------------------------------------------------------
// Registry — o que vem da base de dados
// ---------------------------------------------------------------------

export type ProviderRow = {
  id: string;
  display_name: string;
  adapter: "openai" | "google" | "anthropic";
  base_url: string | null;
  api_key_env: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

export type ModelRow = {
  id: string;
  provider_id: string;
  provider_model_id: string;
  display_name: string;
  status: "ACTIVE" | "DEGRADED" | "DISABLED" | "DEPRECATED" | "RETIRED";
  enabled: boolean;
  supports_streaming: boolean;
  context_window: number | null;
  input_cost: number | null;
  output_cost: number | null;
  cached_input_cost: number | null;
  priority: number;
  health_status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";
  circuit_state: "CLOSED" | "OPEN" | "HALF_OPEN";
  circuit_opened_at: string | null;
  circuit_cooldown_seconds: number;
};

export type AssistantRow = {
  id: string;
  org_id: string | null;
  assistant_key: string;
  nome: string;
  marca: string | null;
  allowed_domains: string[];
  ativo: boolean;
  gateway_enabled: boolean;
  traffic_percentage: number;
  routing_policy_id: string | null;
  max_messages: number;
  max_chars_message: number;
  max_output_tokens: number;
  temperature: number;
};

// ---------------------------------------------------------------------
// Adaptadores de fornecedor
// ---------------------------------------------------------------------

export type GenerateOptions = {
  model: string;
  system?: string;
  messages: N5Message[];
  maxOutputTokens?: number;
  temperature?: number;
  /**
   * Pesquisa web do lado do fornecedor (Gemini: google_search).
   * Os diagnósticos da Terrae dependem disto: o prompt deles proíbe citar
   * números de mercado que não venham da pesquisa desta chamada.
   */
  grounding?: boolean;
  /**
   * Folga somada ao teto de saída. Existe porque `thinkingBudget: 0` não
   * é honrado por todos os modelos — alguns pensam à mesma, SEM dar erro,
   * e o raciocínio come o orçamento até truncar a resposta a meio.
   * maxOutputTokens é um TETO, não um gasto: dar folga é seguro.
   */
  tokenHeadroom?: number;
  /**
   * Não enviar `thinkingConfig` a este pedido. Uso interno do fornecedor
   * Google: os modelos flash mais recentes rejeitam `thinkingBudget: 0`
   * com 400, e o pedido é repetido uma vez sem ele.
   */
  semThinking?: boolean;
  /**
   * Saída estruturada. Não é um caso especial: TODOS os assistentes a
   * sério têm um modo estruturado além da conversa — o Mestre resume
   * leads, a Academia pontua consultores, a Terrae devolve diagnósticos.
   * Sem isto, esses modos devolvem prosa em vez de JSON e falham em
   * silêncio (o `JSON.parse` do chamador rebenta ou devolve lixo).
   */
  jsonMode?: boolean;
  /** Corta ligações penduradas. Sempre definido pelo chamador. */
  timeoutMs: number;
  signal?: AbortSignal;
};

/** Tokens contabilizados. Nem todos os fornecedores devolvem tudo. */
export type TokenUsage = {
  input?: number;
  output?: number;
  cached?: number;
};

/** Resultado normalizado de uma tentativa contra um fornecedor. */
export type ProviderResult = {
  ok: boolean;
  text: string;
  usage?: TokenUsage;
  /** Código HTTP ou 0 para falha de rede/timeout. */
  status: number;
  /** 'transient' vale a pena repetir noutro modelo; 'permanent' não. */
  kind: "ok" | "transient" | "permanent";
  errorCode?: string;
  errorMessage?: string;
  /**
   * O modelo PESQUISOU mesmo? Ter a ferramenta disponível não garante que
   * a use — ele decide. Uma resposta de diagnóstico dada de memória parece
   * boa e não tem fontes; sem isto, não havia como distinguir.
   */
  groundingUsed?: boolean;
  groundingSources?: number;
  /** Nomes/URLs das fontes devolvidas pela pesquisa. */
  groundingUris?: string[];
};

/** Um pedaço do stream, já normalizado. */
export type StreamChunk =
  | { type: "delta"; text: string }
  | { type: "usage"; usage: TokenUsage }
  | { type: "done"; finishReason?: string };

/**
 * A interface que todo o fornecedor implementa. Acrescentar um
 * fornecedor novo é implementar isto — nada mais no sistema muda.
 */
export interface AIProvider {
  readonly id: string;
  generate(opts: GenerateOptions): Promise<ProviderResult>;
  stream(opts: GenerateOptions): AsyncGenerator<StreamChunk, ProviderResult, void>;
  health(model: string): Promise<{ ok: boolean; latencyMs: number; status: number }>;
}

// ---------------------------------------------------------------------
// Telemetria
// ---------------------------------------------------------------------

export type AttemptRecord = {
  provider_id: string;
  provider_model_id: string;
  role: string;
  status: number;
  kind: string;
  latency_ms: number;
  error_code?: string;
};

export type RequestLog = {
  request_id: string;
  trace_id: string;
  org_id: string | null;
  assistant_id: string | null;
  session_id?: string;
  requested_class: RequestClass;
  provider_id?: string;
  model_id?: string;
  provider_model_id?: string;
  routing_reason: string;
  routing_version: string;
  fallback_used: boolean;
  fallback_reason?: string;
  attempt_chain: AttemptRecord[];
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  estimated_cost?: number;
  ttft_ms?: number;
  total_latency_ms?: number;
  gateway_ms?: number;
  status: "ok" | "error" | "blocked" | "timeout" | "budget_exceeded" | "rate_limited";
  error_code?: string;
  streamed: boolean;
};
