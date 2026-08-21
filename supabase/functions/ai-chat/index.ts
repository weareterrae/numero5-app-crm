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

const MAX_BODY = 64 * 1024; // 64 KB

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
  });

  // Junta o CORS ao stream que o core produziu.
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors(origin))) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
});
