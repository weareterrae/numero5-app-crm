/**
 * Camada de IA agnóstica ao fornecedor.
 * Trocar de LLM é mudar duas variáveis de ambiente — nada de código.
 *
 *   IA_PROVIDER = gemini | openai | anthropic
 *   IA_MODELO   = ex.: gemini-flash-latest
 *   IA_API_KEY  = a chave do fornecedor
 */

export type PedidoIA = {
  sistema: string;
  utilizador: string;
  /** Pedir resposta em JSON válido. */
  json?: boolean;
  maxTokens?: number;
  temperatura?: number;
};

export type RespostaIA = { ok: true; texto: string } | { ok: false; erro: string };

export interface FornecedorIA {
  nome: string;
  gerar(p: PedidoIA): Promise<RespostaIA>;
}

// ---------------------------------------------------------------- Gemini
class Gemini implements FornecedorIA {
  nome = "gemini";
  constructor(
    private chave: string,
    private modelo: string,
  ) {}

  async gerar(p: PedidoIA): Promise<RespostaIA> {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.modelo}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": this.chave, "content-type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: p.sistema }] },
            contents: [{ role: "user", parts: [{ text: p.utilizador }] }],
            generationConfig: {
              // Generoso de propósito: com pouco espaço, o modelo "pensa"
              // e corta a resposta a meio — já nos aconteceu.
              maxOutputTokens: Math.max(p.maxTokens ?? 4096, 2048),
              temperature: p.temperatura ?? 0.8,
              ...(p.json ? { responseMimeType: "application/json" } : {}),
            },
          }),
        },
      );
      if (!r.ok) return { ok: false, erro: `Gemini respondeu ${r.status}` };
      const d = await r.json();
      const texto = (d?.candidates?.[0]?.content?.parts ?? [])
        .filter((x: { thought?: boolean; text?: string }) => x && !x.thought && typeof x.text === "string")
        .map((x: { text: string }) => x.text)
        .join("")
        .trim();
      return texto ? { ok: true, texto } : { ok: false, erro: "Resposta vazia." };
    } catch (e) {
      return { ok: false, erro: String(e) };
    }
  }
}

// ---------------------------------------------------------------- OpenAI
class OpenAI implements FornecedorIA {
  nome = "openai";
  constructor(
    private chave: string,
    private modelo: string,
  ) {}

  async gerar(p: PedidoIA): Promise<RespostaIA> {
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${this.chave}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: this.modelo,
          messages: [
            { role: "system", content: p.sistema },
            { role: "user", content: p.utilizador },
          ],
          max_completion_tokens: p.maxTokens ?? 4096,
          temperature: p.temperatura ?? 0.8,
          ...(p.json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!r.ok) return { ok: false, erro: `OpenAI respondeu ${r.status}` };
      const d = await r.json();
      const texto = (d?.choices?.[0]?.message?.content ?? "").trim();
      return texto ? { ok: true, texto } : { ok: false, erro: "Resposta vazia." };
    } catch (e) {
      return { ok: false, erro: String(e) };
    }
  }
}

// ------------------------------------------------------------- Anthropic
class Anthropic implements FornecedorIA {
  nome = "anthropic";
  constructor(
    private chave: string,
    private modelo: string,
  ) {}

  async gerar(p: PedidoIA): Promise<RespostaIA> {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": this.chave,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.modelo,
          system: p.sistema,
          messages: [{ role: "user", content: p.utilizador }],
          max_tokens: p.maxTokens ?? 4096,
          temperature: p.temperatura ?? 0.8,
        }),
      });
      if (!r.ok) return { ok: false, erro: `Anthropic respondeu ${r.status}` };
      const d = await r.json();
      const texto = (d?.content ?? [])
        .filter((c: { type: string }) => c.type === "text")
        .map((c: { text: string }) => c.text)
        .join("")
        .trim();
      return texto ? { ok: true, texto } : { ok: false, erro: "Resposta vazia." };
    } catch (e) {
      return { ok: false, erro: String(e) };
    }
  }
}

/** Devolve o fornecedor configurado, ou null se não houver chave. */
export function obterIA(): FornecedorIA | null {
  const chave = process.env.IA_API_KEY;
  if (!chave) return null;
  const modelo = process.env.IA_MODELO || "gemini-flash-latest";
  switch ((process.env.IA_PROVIDER || "gemini").toLowerCase()) {
    case "openai":
      return new OpenAI(chave, modelo);
    case "anthropic":
      return new Anthropic(chave, modelo);
    default:
      return new Gemini(chave, modelo);
  }
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
