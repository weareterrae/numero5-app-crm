import { readFileSync } from "fs";
import { Parser } from "@deno/eszip";

let token = "";
try { const raw = readFileSync("C:/Dev/KoolNature/.mcp.json", "utf8"); const m = raw.match(/sbp_[A-Za-z0-9]+/); if (m) token = m[0]; } catch {}
if (!token) { console.log("sem token"); process.exit(1); }
const H = { authorization: `Bearer ${token}` };

const ALVO = process.argv[2] || "rycgekqszxyudmchpqvs"; // por defeito, Nº5

async function extrair(ref) {
  const bytes = new Uint8Array(await (await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/meta-inbox/body`, { headers: H })).arrayBuffer());
  const p = await Parser.createInstance();
  const specs = await p.parseBytes(bytes);
  await p.load();
  const spec = specs.find((s) => /index\.ts$/.test(s) && !s.includes("---"));
  return await p.getModuleSource(spec);
}
function patch(src) {
  if (src.includes("const emailRes = await fetch")) return { skip: "já aplicado" };
  const nIdx = src.indexOf("async function notify(");
  const fIdx = src.indexOf('await fetch("https://api.resend.com/emails"', nIdx);
  const endSeq = "\n  });\n}";
  const eIdx = src.indexOf(endSeq, fIdx);
  if (nIdx < 0 || fIdx < 0 || eIdx < 0) return { erro: `estrutura diferente (n=${nIdx} f=${fIdx} e=${eIdx})` };
  // garantir que o eIdx pertence a este fetch (não há outro '});' antes) — o fetch é a última coisa do notify
  const TRACE = `  if ((!emailRes || !emailRes.ok) && p.id && !p.autoSent) {\n` +
    "    const motivo = `aviso por email falhou (Resend ${emailRes ? emailRes.status : \"sem resposta\"}) — resposta por aprovar sem notificacao`;\n" +
    `    try { await db.from("pending_replies").update({ status: "error", detail: motivo }).eq("id", p.id).eq("status", "pending"); } catch (_) {}\n` +
    `  }`;
  const out = src.slice(0, fIdx) + "const emailRes = " + src.slice(fIdx, eIdx) + "\n  }).catch(() => null);\n" + TRACE + "\n}" + src.slice(eIdx + endSeq.length);
  return { out };
}

const meta = await (await fetch(`https://api.supabase.com/v1/projects/${ALVO}/functions/meta-inbox`, { headers: H })).json();
const src = await extrair(ALVO);
console.log("extraído:", src.length, "bytes · version atual", meta.version);
const r = patch(src);
if (r.skip) { console.log("SKIP:", r.skip); process.exit(0); }
if (r.erro) { console.log("ABORTADO:", r.erro); process.exit(1); }
console.log("patch OK · +", r.out.length - src.length, "bytes");

const fd = new FormData();
fd.append("metadata", JSON.stringify({ entrypoint_path: "index.ts", name: "meta-inbox", verify_jwt: meta.verify_jwt }));
fd.append("file", new Blob([r.out], { type: "application/typescript" }), "index.ts");
const dep = await fetch(`https://api.supabase.com/v1/projects/${ALVO}/functions/deploy?slug=meta-inbox`, { method: "POST", headers: H, body: fd });
console.log("DEPLOY → HTTP", dep.status, "·", (await dep.text()).slice(0, 200));

// verificação pós-deploy
await new Promise((res) => setTimeout(res, 2500));
const meta2 = await (await fetch(`https://api.supabase.com/v1/projects/${ALVO}/functions/meta-inbox`, { headers: H })).json();
const live = await (await fetch(`https://${ALVO}.functions.supabase.co/meta-inbox`)).text().catch(() => "ERRO");
let confirma = "?";
try { confirma = (await extrair(ALVO)).includes("const emailRes = await fetch") ? "SIM" : "NÃO"; } catch {}
console.log(`RESULTADO: version ${meta.version} → ${meta2.version} · health ${JSON.stringify(live.slice(0,16))} · patch no deployado: ${confirma}`);
