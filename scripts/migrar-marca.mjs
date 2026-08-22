// Liga um site de marca ao N5 AI Gateway.
//
//   node scripts/migrar-marca.mjs <ficheiro> <assistant_key> <origin> <chamadaAntiga>
//
// Insere o helper e envolve a chamada antiga: o gateway primeiro, o
// caminho de sempre como rede. Respeita as terminações de linha do
// ficheiro (os sites usam CRLF) e usa String.fromCharCode(10) no parser
// SSE — o escape literal já partiu isto uma vez, em silêncio.
import { readFileSync, writeFileSync } from "node:fs";

const [ficheiro, chave, origem, chamadaAntiga, nomeVar = "b"] = process.argv.slice(2);
if (!ficheiro || !chave || !origem || !chamadaAntiga) {
  console.error("uso: migrar-marca.mjs <ficheiro> <assistant_key> <origin> <chamadaAntiga> [nomeVar]");
  process.exit(1);
}

let s = readFileSync(ficheiro, "utf8");
const EOL = s.includes("\r\n") ? "\r\n" : "\n";
if (s.includes("n5Gateway")) { console.log("já migrado: " + ficheiro); process.exit(0); }

let bloco = readFileSync("scripts/patch-site-gateway.mjs", "utf8")
  .match(/export const BLOCO_N5 = `([\s\S]*?)`;/)[1].trim();
// chave por omissão: um assistente por site dispensa mais uma variável
bloco = bloco.replace(
  "const N5_ASSISTANT_KEY = process.env.N5_ASSISTANT_KEY;",
  `const N5_ASSISTANT_KEY = process.env.N5_ASSISTANT_KEY || "${chave}";`,
);
bloco = bloco.split("\n").join(EOL);

// 1. helper: antes da primeira função de topo
const marcaHelper = s.match(/^(const|async function|function|export) /m);
if (!marcaHelper) { console.error("não encontrei onde inserir o helper"); process.exit(1); }
const iHelper = s.indexOf(marcaHelper[0]);
s = s.slice(0, iHelper) + bloco + EOL + EOL + s.slice(iHelper);

// 2. gateway antes da chamada antiga
if (!s.includes(chamadaAntiga)) { console.error("não encontrei: " + chamadaAntiga); process.exit(1); }
const novo = [
  "  // N5 AI Gateway primeiro; o caminho antigo fica como rede.",
  `  const viaN5 = await n5Gateway(messages, { system, origin: "${origem}" });`,
  `  const ${nomeVar} = viaN5 || ` + chamadaAntiga.replace(/^\s*const\s+\w+\s*=\s*/, "").replace(/;$/, "") + ";",
].join(EOL);
s = s.replace(chamadaAntiga, novo);

writeFileSync(ficheiro, s, "utf8");
console.log("✓ " + ficheiro);
console.log("  helper:", /async function n5Gateway/.test(s), "| chamada:", /const viaN5 = await n5Gateway/.test(s));
