// =====================================================================
// POST /ai/v1/chat — o único endpoint que os sites conhecem
// ---------------------------------------------------------------------
// Este ficheiro é o ADAPTADOR DE RUNTIME e nada mais. É a única peça do
// N5 AI OS que sabe que estamos em Deno/Supabase Edge. Faz:
//   receber → autenticar → invocar o core → devolver o stream.
//
// Toda a lógica de negócio vive em _shared/n5-ai/, escrita só com APIs
// Web. Mover para container, AWS ou Workers = reescrever ESTE ficheiro,
// não o produto. Foi a condição do mandato.
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { Gateway } from "../_shared/n5-ai/gateway.ts";
import type { ChatRequest } from "../_shared/n5-ai/types.ts";

// Teto do corpo. Começou em 64 KB e a Massa Prima bateu nele: o system dela
// é uma base de conhecimento inteira (~72 KB, 18 mil tokens) que o site vai
// buscar a um ficheiro e envia a cada mensagem. Rejeitávamos com 413 e o site
// caía calado para o caminho antigo — respondia bem, mas sem rede nem medição.
//
// 256 KB acomoda essas bases sem deixar de ser um teto: o JSON.parse de um
// corpo destes gasta milissegundos do orçamento de 2s de CPU.
//
// Nota de custo: NÃO encarece nada. O site já pagava esses 18 mil tokens ao
// Gemini em cada mensagem — pelo gateway paga o mesmo e ganha fallback entre
// fornecedores. Quem baixa mesmo a conta é o prompt caching, a seguir.
const MAX_BODY = 256 * 1024;

/**
 * Lê a claim `role` do JWT — sem verificar assinatura, de propósito.
 *
 * Não é autenticação: quem chega aqui já passou pelo `verify_jwt` da própria
 * Edge Function, que valida a assinatura antes de o nosso código correr. Isto
 * só distingue QUEM é, entre pedidos já válidos.
 *
 * Hoje só serve o ensaio (atravessar a fatia de rollout). Qualquer poder que
 * venha a depender disto deve ser revisto à luz desta nota — se um dia esta
 * função for chamada num sítio sem verificação a montante, a leitura passa a
 * ser uma afirmação do chamador, não um facto.
 */
function ehServiceRole(auth: string | null): boolean {
  const t = (auth ?? "").replace(/^Bearer\s+/i, "").trim().split(".");
  if (t.length !== 3) return false;
  try {
    const b = t[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b + "=".repeat((4 - b.length % 4) % 4)))?.role === "service_role";
  } catch { return false; }
}

// O gateway fala com a BD como serviço: a autorização por tenant já foi
// resolvida em código (origem + assistant_key), e o ledger tem de poder
// escrever em tabelas que o utilizador anónimo não vê.
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const gateway = new Gateway({
  db,
  getEnv: (name) => Deno.env.get(name),
  // waitUntil mantém o trabalho vivo depois da resposta fechar — é o que
  // permite ter contabilidade e saúde FORA do caminho crítico.
  background: (p) => {
    try {
      // @ts-ignore — presente no runtime das Edge Functions
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(p);
        return;
      }
    } catch { /* runtime sem waitUntil */ }
    p.catch(() => {});
  },
});

function cors(origin: string | null): Record<string, string> {
  return {
    // A allowlist a sério é validada no core, contra o registo.
    // Aqui é só o pré-voo do browser.
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "vary": "origin",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: cors(origin) });
  }

  // Corpo com teto — não deixar um pedido gigante consumir o CPU (2s).
  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return new Response(JSON.stringify({ error: "payload_too_large" }), {
      status: 413, headers: { ...cors(origin), "content-type": "application/json" },
    });
  }

  let body: ChatRequest;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400, headers: { ...cors(origin), "content-type": "application/json" },
    });
  }
  if (!body?.assistant_key || !Array.isArray(body?.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "invalid_request" }), {
      status: 400, headers: { ...cors(origin), "content-type": "application/json" },
    });
  }

  const res = await gateway.handle(body, {
    origin,
    referer: req.headers.get("referer"),
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    isServiceRole: ehServiceRole(req.headers.get("authorization")),
  });

  // Junta o CORS ao stream que o core produziu.
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors(origin))) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
});
