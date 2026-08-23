import { readFileSync } from "fs";
import { Parser } from "@deno/eszip";

let token = "";
try { const raw = readFileSync("C:/Dev/KoolNature/.mcp.json", "utf8"); const m = raw.match(/sbp_[A-Za-z0-9]+/); if (m) token = m[0]; } catch {}
if (!token) { console.log("sem token"); process.exit(1); }
const REF = "rycgekqszxyudmchpqvs"; // Nº5 (teste no próprio)
const H = { authorization: `Bearer ${token}` };

const meta = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/functions/meta-inbox`, { headers: H })).json();
console.log("1) version=", meta.version, " verify_jwt=", meta.verify_jwt, " import_map_path=", meta.import_map_path ? "SIM" : "não");

const bytes = new Uint8Array(await (await fetch(`https://api.supabase.com/v1/projects/${REF}/functions/meta-inbox/body`, { headers: H })).arrayBuffer());
const parser = await Parser.createInstance();
const specs = await parser.parseBytes(bytes);
await parser.load();
const tsSpec = specs.find((s) => /index\.ts$/.test(s) && !s.includes("---"));
const src = await parser.getModuleSource(tsSpec);
console.log("2) extraído", tsSpec, "·", src.length, "bytes");

const nIdx = src.indexOf("async function notify(");
const anchor = 'await fetch("https://api.resend.com/emails"';
const fIdx = src.indexOf(anchor, nIdx);
const endSeq = "\n  });\n}";
const eIdx = src.indexOf(endSeq, fIdx);
if (nIdx < 0 || fIdx < 0 || eIdx < 0) { console.log("3) ABORTADO: estrutura diferente (fIdx", fIdx, "eIdx", eIdx, ")"); process.exit(1); }
if (src.includes("const emailRes = await fetch")) { console.log("3) já aplicado — nada a fazer"); process.exit(0); }
const TRACE = `  if ((!emailRes || !emailRes.ok) && p.id && !p.autoSent) {\n` +
  "    const motivo = `aviso por email falhou (Resend ${emailRes ? emailRes.status : \"sem resposta\"}) — resposta por aprovar sem notificacao`;\n" +
  `    try { await db.from("pending_replies").update({ status: "error", detail: motivo }).eq("id", p.id).eq("status", "pending"); } catch (_) {}\n` +
  `  }`;
const fetchExpr = src.slice(fIdx, eIdx);
const patched = src.slice(0, fIdx) + "const emailRes = " + fetchExpr + "\n  }).catch(() => null);\n" + TRACE + "\n}" + src.slice(eIdx + endSeq.length);
console.log("3) patch OK · delta", patched.length - src.length, "bytes · emailRes:", patched.includes("const emailRes = await fetch"));

const fd = new FormData();
fd.append("metadata", JSON.stringify({ entrypoint_path: "index.ts", name: "meta-inbox", verify_jwt: meta.verify_jwt }));
fd.append("file", new Blob([patched], { type: "application/typescript" }), "index.ts");
const dep = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions/deploy?slug=meta-inbox`, { method: "POST", headers: H, body: fd });
console.log("4) DEPLOY → HTTP", dep.status, "·", (await dep.text()).slice(0, 220));

const meta2 = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/functions/meta-inbox`, { headers: H })).json();
const live = await (await fetch(`https://${REF}.functions.supabase.co/meta-inbox`)).text().catch(() => "erro");
console.log("5) nova version=", meta2.version, "(antes", meta.version, ") · health:", JSON.stringify(live.slice(0, 20)));
