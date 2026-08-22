/**
 * Camada de IA agnóstica ao fornecedor, resiliente a soluços transitórios
 * (503 "overloaded", 429, 5xx, timeouts) da API: repete com recuo, cai para um
 * modelo alternativo e corta ligações penduradas. Nunca atira exceções para fora.
 *
 *   IA_PROVIDER        = gemini | openai | anthropic
 *   IA_MODELO          = ex.: gemini-flash-latest      (modelo primário)
 *   IA_MODELO_FALLBACK = ex.: gemini-2.0-flash         (rede de segurança; opcional)
 *   IA_API_KEY         = a chave do fornecedor
 */

export type PedidoIA = {
  sistema: string;
  utilizador: string;
  /** Pedir resposta em JSON válido. */
  json?: boolean;
  maxTokens?: number;
  temperatura?: number;
  /** Corta ligações penduradas (ms). Defeito 15000. */
  timeoutMs?: number;
  /**
   * Chave do assistente no registo do N5 AI Gateway. Explícita de propósito:
   * cada uso desta app tem um teto de tokens e um comportamento próprios, e
   * adivinhar pelo conteúdo dava um dia o assistente errado — com o teto
   * errado e um JSON cortado a meio, que foi o que aconteceu na Terrae.
   *
   * Sem esta chave o pedido segue direto ao fornecedor, como sempre.
   */
  n5?: string;
};

export type RespostaIA = { ok: true; texto: string } | { ok: false; erro: string };

export interface FornecedorIA {
  nome: string;
  gerar(p: PedidoIA): Promise<RespostaIA>;
}

// -------------------------------------------------------- resiliência
type Estado = "ok" | "transitorio" | "permanente";
type Tentativa = { estado: Estado; status: number; texto: string; erro?: string };

const TRANSITORIO = new Set([408, 425, 429, 500, 502, 503, 504]); // vale a pena repetir
const MAX_TENTATIVAS = 3; // por modelo
const TIMEOUT_MS = 15000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Um motor sabe fazer uma chamada e listar os seus modelos (primário → fallback). */
interface Motor extends FornecedorIA {
  modelos(): string[];
  umaChamada(modelo: string, p: PedidoIA, timeoutMs: number): Promise<Tentativa>;
}

/** Repete na MESMA (modelo) só em erros transitórios, com recuo 400ms×tentativa. */
async function tentarModelo(m: Motor, modelo: string, p: PedidoIA, timeoutMs: number): Promise<Tentativa> {
  let ultima: Tentativa = { estado: "transitorio", status: 0, texto: "", erro: "sem resposta" };
  for (let t = 1; t <= MAX_TENTATIVAS; t++) {
    ultima = await m.umaChamada(modelo, p, timeoutMs);
    if (ultima.estado === "ok" || ultima.estado === "permanente") return ultima;
    if (t < MAX_TENTATIVAS) await dormir(400 * t);
  }
  return ultima; // esgotou as tentativas (transitório)
}

/** Percorre modelos × tentativas; devolve o 1º texto não-vazio ou o último erro. */
async function executarResiliente(m: Motor, p: PedidoIA): Promise<RespostaIA> {
  const timeoutMs = p.timeoutMs ?? TIMEOUT_MS;
  let algumOk = false;
  let ultimoErro = `${m.nome}: falha desconhecida.`;
  for (const modelo of m.modelos()) {
    const res = await tentarModelo(m, modelo, p, timeoutMs);
    if (res.estado === "ok") {
      algumOk = true;
      if (res.texto) return { ok: true, texto: res.texto };
      ultimoErro = "Resposta vazia."; // 200 mas vazio → tenta o próximo modelo
      continue;
    }
    ultimoErro = res.erro || `${m.nome} respondeu ${res.status}`;
    // transitório/permanente → próximo modelo (o fallback pode aceitar o pedido)
  }
  return { ok: false, erro: algumOk ? "Resposta vazia." : ultimoErro };
}

/** Faz o fetch com timeout e classifica o resultado. Não atira. */
async function fetchClassificado(
  nome: string,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  extrair: (d: unknown) => string,
): Promise<Tentativa> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let r: Response;
  try {
    r = await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    // AbortError (timeout) ou falha de rede → transitório, vale a pena repetir
    return { estado: "transitorio", status: 0, texto: "", erro: `${nome}: ${String(e)}` };
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    const estado: Estado = TRANSITORIO.has(r.status) ? "transitorio" : "permanente";
    return { estado, status: r.status, texto: "", erro: `${nome} ${r.status}: ${corpo.slice(0, 200)}` };
  }
  const d = await r.json().catch(() => null);
  return { estado: "ok", status: 200, texto: extrair(d) };
}

function listaModelos(primario: string, fallback: string | undefined): string[] {
  return [...new Set([primario, fallback].filter((x): x is string => !!x))];
}

// ---------------------------------------------------------------- Gemini
class Gemini implements Motor {
  nome = "gemini";
  constructor(
    private chave: string,
    private modelo: string,
    private fallback: string | undefined,
  ) {}

  modelos() {
    return listaModelos(this.modelo, this.fallback);
  }

  umaChamada(modelo: string, p: PedidoIA, timeoutMs: number): Promise<Tentativa> {
    return fetchClassificado(
      "Gemini",
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": this.chave, "content-type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: p.sistema }] },
          contents: [{ role: "user", parts: [{ text: p.utilizador }] }],
          generationConfig: {
            // Generoso de propósito: com pouco espaço, o modelo "pensa" e corta a meio.
            maxOutputTokens: Math.max(p.maxTokens ?? 4096, 2048),
            temperature: p.temperatura ?? 0.8,
            ...(p.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      },
      timeoutMs,
      (d) => {
        const parts = (d as { candidates?: { content?: { parts?: unknown[] } }[] })?.candidates?.[0]?.content?.parts ?? [];
        return (parts as { thought?: boolean; text?: string }[])
          .filter((x) => x && !x.thought && typeof x.text === "string")
          .map((x) => x.text as string)
          .join("")
          .trim();
      },
    );
  }

  gerar(p: PedidoIA) {
    return executarResiliente(this, p);
  }
}

// ---------------------------------------------------------------- OpenAI
class OpenAI implements Motor {
  nome = "openai";
  constructor(
    private chave: string,
    private modelo: string,
    private fallback: string | undefined,
  ) {}

  modelos() {
    return listaModelos(this.modelo, this.fallback);
  }

  umaChamada(modelo: string, p: PedidoIA, timeoutMs: number): Promise<Tentativa> {
    return fetchClassificado(
      "OpenAI",
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: { authorization: `Bearer ${this.chave}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: modelo,
          messages: [
            { role: "system", content: p.sistema },
            { role: "user", content: p.utilizador },
          ],
          max_completion_tokens: p.maxTokens ?? 4096,
          temperature: p.temperatura ?? 0.8,
          ...(p.json ? { response_format: { type: "json_object" } } : {}),
        }),
      },
      timeoutMs,
      (d) => ((d as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content ?? "").trim(),
    );
  }

  gerar(p: PedidoIA) {
    return executarResiliente(this, p);
  }
}

// ------------------------------------------------------------- Anthropic
class Anthropic implements Motor {
  nome = "anthropic";
  constructor(
    private chave: string,
    private modelo: string,
    private fallback: string | undefined,
  ) {}

  modelos() {
    return listaModelos(this.modelo, this.fallback);
  }

  umaChamada(modelo: string, p: PedidoIA, timeoutMs: number): Promise<Tentativa> {
    return fetchClassificado(
      "Anthropic",
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": this.chave,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: modelo,
          system: p.sistema,
          messages: [{ role: "user", content: p.utilizador }],
          max_tokens: p.maxTokens ?? 4096,
          temperature: p.temperatura ?? 0.8,
        }),
      },
      timeoutMs,
      (d) =>
        ((d as { content?: { type: string; text?: string }[] })?.content ?? [])
          .filter((c) => c.type === "text")
          .map((c) => c.text as string)
          .join("")
          .trim(),
    );
  }

  gerar(p: PedidoIA) {
    return executarResiliente(this, p);
  }
}

/** Modelo de fallback por defeito, por fornecedor (usado se IA_MODELO_FALLBACK não estiver definido). */
function fallbackPorDefeito(provider: string): string | undefined {
  switch (provider) {
    case "gemini":
      return "gemini-2.0-flash";
    default:
      return undefined; // OpenAI/Anthropic: sem fallback implícito (evita cobrar um modelo inesperado)
  }
}

// ---------------------------------------------------------------------
// N5 AI Gateway
// ---------------------------------------------------------------------
// Esta app é onde o gateway VIVE, mas fala-lhe como qualquer outro site:
// por HTTP, com origem declarada e chave de assistente. Não há atalho por
// dentro de propósito — o que se ganha é o mesmo caminho, as mesmas regras
// e o mesmo registo de custo que todas as marcas têm.
//
// O que traz e este ficheiro não sabe fazer: mudar de FORNECEDOR (aqui a
// resiliência é entre modelos do mesmo), disjuntor por modelo, custo e
// tokens por pedido, e a percentagem de tráfego a mudar sem deploy.
const N5_URL = process.env.N5_GATEWAY_URL || "";

class N5Gateway implements FornecedorIA {
  nome = "n5-gateway";
  constructor(private readonly seguinte: FornecedorIA) {}

  async gerar(p: PedidoIA): Promise<RespostaIA> {
    const viaN5 = p.n5 ? await this.tentar(p) : null;
    return viaN5 ?? this.seguinte.gerar(p);
  }

  private async tentar(p: PedidoIA): Promise<RespostaIA | null> {
    try {
      const r = await fetch(N5_URL, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://app.numerocinco.pt" },
        body: JSON.stringify({
          assistant_key: p.n5,
          system: p.sistema,
          messages: [{ role: "user", content: p.utilizador }],
          ...(p.json ? { response_format: "json" } : {}),
          ...(p.maxTokens ? { max_output_tokens: p.maxTokens } : {}),
        }),
        signal: AbortSignal.timeout(Math.max(p.timeoutMs ?? 15000, 30000)),
      });
      if (!r.ok || !r.body) return null;

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "", texto = "", erro: string | null = null;
      for (;;) {
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
      // 'rollout_excluded' é resposta normal: não pertence à fatia migrada.
      if (erro || !texto.trim()) return null;
      return { ok: true, texto };
    } catch {
      return null;
    }
  }
}

/** Devolve o fornecedor configurado, ou null se não houver chave. */
export function obterIA(): FornecedorIA | null {
  const chave = process.env.IA_API_KEY;
  if (!chave) return null;
  const modelo = process.env.IA_MODELO || "gemini-flash-latest";
  const provider = (process.env.IA_PROVIDER || "gemini").toLowerCase();
  const fallback = process.env.IA_MODELO_FALLBACK || fallbackPorDefeito(provider);
  let motor: FornecedorIA;
  switch (provider) {
    case "openai":
      motor = new OpenAI(chave, modelo, fallback);
      break;
    case "anthropic":
      motor = new Anthropic(chave, modelo, fallback);
      break;
    default:
      motor = new Gemini(chave, modelo, fallback);
  }
  // O gateway primeiro, o motor direto como rede. Só para pedidos que digam
  // qual é o assistente: sem `n5`, nada muda.
  return N5_URL ? new N5Gateway(motor) : motor;
}

/** Extrai JSON de uma resposta, mesmo que venha com texto à volta. */
export function lerJson<T>(texto: string): T | null {
  try {
    return JSON.parse(texto) as T;
  } catch {
    const m = texto.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}
