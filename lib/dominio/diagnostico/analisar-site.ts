/**
 * Ir buscar uma página e prepará-la para as verificações.
 * Partilhado pela rota /api/analisar (com sessão) e pelo formulário público
 * de diagnóstico (sem sessão) — a mesma guarda de segurança nos dois.
 */

import type { Contexto } from "./verificacoes";

const TEMPO_LIMITE = 12_000;

/** Impede que a análise seja usada para espreitar a rede interna (SSRF). */
export function enderecoPermitido(u: URL): boolean {
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0") return false;
  if (/^(127|10)\./.test(h)) return false;
  if (/^192\.168\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (/^169\.254\./.test(h)) return false; // metadados de cloud
  if (h.endsWith(".internal") || h.endsWith(".local")) return false;
  if (h.includes(":")) return false; // IPv6 literal
  return true;
}

export type ResultadoObter =
  | { ok: true; ctx: Contexto }
  | { ok: false; erro: string };

export async function obterContexto(bruto: string): Promise<ResultadoObter> {
  const limpo = (bruto ?? "").trim();
  if (!limpo) return { ok: false, erro: "Falta o endereço." };

  let alvo: URL;
  try {
    alvo = new URL(/^https?:\/\//i.test(limpo) ? limpo : `https://${limpo}`);
  } catch {
    return { ok: false, erro: "Endereço inválido." };
  }
  if (!enderecoPermitido(alvo)) return { ok: false, erro: "Endereço não permitido." };

  const inicio = Date.now();
  let resposta: Response;
  try {
    resposta = await fetch(alvo.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(TEMPO_LIMITE),
      headers: { "user-agent": "Numero5-Diagnostico/1.0 (+https://numerocinco.pt)" },
    });
  } catch {
    return {
      ok: false,
      erro: "Não foi possível aceder a este endereço. Pode estar offline ou a bloquear robôs.",
    };
  }
  const ms = Date.now() - inicio;
  const html = await resposta.text().catch(() => "");

  return {
    ok: true,
    ctx: {
      url: alvo.toString(),
      urlFinal: resposta.url || alvo.toString(),
      html,
      ms,
      status: resposta.status,
    },
  };
}
