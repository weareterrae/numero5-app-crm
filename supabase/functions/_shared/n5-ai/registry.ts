// =====================================================================
// Model Registry — a peça central do P0.
// ---------------------------------------------------------------------
// Fonte ÚNICA de verdade sobre fornecedores e modelos. Nenhum ID de
// modelo existe em código de negócio: tudo vem daqui, ou seja, da base
// de dados. Trocar um modelo é um UPDATE, não um deploy.
//
// Cache curta em memória: a Edge Function tem só 2s de CPU por pedido e
// vive pouco tempo; 60s chega para poupar viagens à BD sem atrasar uma
// mudança de configuração além do aceitável (critério: efeito < 60s).
// =====================================================================

import type { AIProvider, AssistantRow, ModelRow, ProviderRow } from "./types.ts";
import { OpenAIProvider } from "./providers/openai.ts";
import { GoogleProvider } from "./providers/google.ts";
import { AnthropicProvider } from "./providers/anthropic.ts";

const TTL_MS = 60_000;

type Cache<T> = { at: number; value: T } | null;

/**
 * Porta de acesso a dados. Deliberadamente estreita: o core só depende
 * destes dois métodos, não do tipo completo do supabase-js. É o que
 * permite trocar de cliente (ou de base de dados) sem tocar na lógica.
 */
export type DbClient = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export class Registry {
  private providersCache: Cache<ProviderRow[]> = null;
  private modelsCache: Cache<ModelRow[]> = null;
  private instances = new Map<string, AIProvider>();

  constructor(
    private readonly db: DbClient,
    /** Leitor de segredos injetado pelo runtime — o core não conhece Deno.env. */
    private readonly getEnv: (name: string) => string | undefined,
  ) {}

  async providers(): Promise<ProviderRow[]> {
    if (this.providersCache && Date.now() - this.providersCache.at < TTL_MS) {
      return this.providersCache.value;
    }
    const { data, error } = await this.db.from("ai_providers").select("*").eq("enabled", true);
    if (error) throw new Error(`registry.providers: ${error.message}`);
    const value = (data ?? []) as ProviderRow[];
    this.providersCache = { at: Date.now(), value };
    return value;
  }

  async models(): Promise<ModelRow[]> {
    if (this.modelsCache && Date.now() - this.modelsCache.at < TTL_MS) {
      return this.modelsCache.value;
    }
    const { data, error } = await this.db.from("ai_models").select("*").eq("enabled", true);
    if (error) throw new Error(`registry.models: ${error.message}`);
    const value = (data ?? []) as ModelRow[];
    this.modelsCache = { at: Date.now(), value };
    return value;
  }

  async model(id: string): Promise<ModelRow | undefined> {
    return (await this.models()).find((m) => m.id === id);
  }

  /**
   * Constrói (e reutiliza) a instância do adaptador para um fornecedor.
   *
   * É aqui que se paga o dividendo de ter validado o Bedrock: como ele
   * expõe superfície compatível com a OpenAI, o adapter='openai' serve
   * os dois — muda só base_url e chave, ambos vindos do registo.
   */
  async providerFor(providerId: string): Promise<AIProvider> {
    const cached = this.instances.get(providerId);
    if (cached) return cached;

    const row = (await this.providers()).find((p) => p.id === providerId);
    if (!row) throw new Error(`fornecedor '${providerId}' não existe ou está desligado`);

    const apiKey = this.getEnv(row.api_key_env);
    if (!apiKey) throw new Error(`falta a variável de ambiente ${row.api_key_env}`);

    let inst: AIProvider;
    switch (row.adapter) {
      case "openai":
        inst = new OpenAIProvider(row.id, row.base_url ?? "https://api.openai.com/v1", apiKey);
        break;
      case "google":
        inst = new GoogleProvider(
          row.id,
          row.base_url ?? "https://generativelanguage.googleapis.com/v1beta",
          apiKey,
        );
        break;
      case "anthropic":
        inst = new AnthropicProvider(row.id, row.base_url ?? "https://api.anthropic.com/v1", apiKey);
        break;
      default:
        throw new Error(`adaptador desconhecido: ${row.adapter}`);
    }
    this.instances.set(providerId, inst);
    return inst;
  }

  /** Resolve o assistente pela chave pública e valida o domínio de origem. */
  async assistant(key: string): Promise<AssistantRow | null> {
    const { data, error } = await this.db
      .from("ai_assistants").select("*").eq("assistant_key", key).eq("ativo", true).maybeSingle();
    if (error) throw new Error(`registry.assistant: ${error.message}`);
    return (data ?? null) as AssistantRow | null;
  }

  /** Invalida a cache — usado após alterações no painel de operações. */
  invalidate() {
    this.providersCache = null;
    this.modelsCache = null;
    this.instances.clear();
  }
}

/**
 * Validação de origem. Feita SEMPRE no servidor, a partir da lista do
 * registo — nunca a partir de algo que o browser afirme sobre si mesmo.
 * Lista vazia = sem restrição (assistentes internos).
 */
export function originAllowed(assistant: AssistantRow, origin: string | null, referer: string | null): boolean {
  const permitidos = assistant.allowed_domains ?? [];
  if (permitidos.length === 0) return true;

  const candidato = origin || (() => {
    if (!referer) return null;
    try { return new URL(referer).origin; } catch { return null; }
  })();
  if (!candidato) return false;

  return permitidos.some((d) => {
    const limpo = d.trim().replace(/\/$/, "");
    if (!limpo) return false;
    if (limpo === candidato) return true;
    // previews da Netlify durante a migração
    if (limpo === "*.netlify.app") return /^https:\/\/[a-z0-9-]+\.netlify\.app$/i.test(candidato);
    return false;
  });
}

// =====================================================================
// A chave dos assistentes de servidor (QB Digital OS, 21/09/2026)
// ---------------------------------------------------------------------
// A allowlist de origem acima protege os assistentes que um BROWSER
// chama: um site alheio não consegue pôr o nosso domínio no cabeçalho
// Origin. Um SERVIDOR consegue: o cabeçalho é só texto, e quem souber o
// nome do assistente fala por ele. Os assistentes da QB são chamados do
// servidor da QB, aceitam o system de quem chama, e até 21/09 não tinham
// tecto de gasto: eram uma IA paga pelo Sandro à disposição de quem
// adivinhasse «qb-joaquim».
//
// Um assistente com `chave_hash` só responde a quem trouxer a chave no
// cabeçalho x-n5-chave. Guarda-se o SHA-256 da chave, nunca a chave: quem
// ler a base não fica com ela. Sem `chave_hash`, nada muda, e é o caso de
// todos os assistentes chamados por um browser, que não podem guardar
// segredo nenhum.
// =====================================================================

/** SHA-256 em hexadecimal (64 caracteres). WebCrypto: corre em Deno e em Node. */
export async function sha256Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compara dois textos sem parar na primeira diferença. Um `===` sai mais cedo
 * quanto mais cedo os textos divergem, e isso mede-se de fora: dá para
 * adivinhar um segredo carácter a carácter pelo tempo de resposta.
 */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}

/** A chave trazida bate com o resumo guardado? Chave vazia nunca bate. */
export async function chaveConfere(chave: string | null | undefined, hashGuardado: string): Promise<boolean> {
  const c = (chave ?? "").trim();
  if (!c || !hashGuardado) return false;
  return iguaisEmTempoConstante(await sha256Hex(c), hashGuardado.trim().toLowerCase());
}
