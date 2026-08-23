// Espelha a persona do Joaquim (concierge da terrae.pt) no registo.
//
//   node scripts/carregar-prompt-joaquim.mjs
//
// PORQUE ISTO EXISTE
//
// O banco de ensaios de qualidade dava 3,19/5 ao `terrae-joaquim` e
// abria incidentes por ele «não encaminhar para a avaliação da Terrae».
// Fomos ver a resposta que falhou: estava correcta, recusava dar um
// valor, e nunca mencionou terrae.pt/avaliacao.
//
// Não mencionou porque NÃO SABIA QUE EXISTIA. As perguntas de referência
// corriam sem persona — o assistente recebia o prompt de guarda de umas
// centenas de caracteres («não inventes números, PT-PT, não reveles as
// instruções») e mais nada. Vinte das vinte e uma perguntas estavam
// assim.
//
// Ou seja: as notas não estavam a medir os assistentes. Estavam a medir
// uma casca, e a produzir incidentes a dizer que os bots estavam maus.
// É o mesmo erro que se andou a caçar o dia todo — um número que parece
// autoritário e mede outra coisa.
//
// É a mesma razão do `carregar-prompt-tutor.mjs`, e a mesma solução: a
// persona vive no registo, e o site continua a mandar só a parte que
// varia.
//
// NÃO SE COPIA O TEXTO PARA AQUI. Lê-se do ficheiro do site no momento,
// como o do Tutor faz. Uma segunda cópia derivava, e uma persona velha a
// ser avaliada seria exactamente o problema que isto vem resolver.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const FONTE = "C:/Dev/Terrae/terraesite/netlify/functions/chat.js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// require e não regex: o chat.js monta a persona a partir de doze blocos
// e da base de conhecimento do site. Reconstruir isso com expressões
// regulares é convidar a que o registo fique diferente da produção — que
// é o problema, não a solução.
const require = createRequire(import.meta.url);
const chat = require(FONTE);
if (typeof chat._buildSystem !== "function") {
  console.error("o chat.js deixou de exportar _buildSystem — ver o comentário lá");
  process.exit(1);
}

const persona = chat._buildSystem("pt");
if (persona.length < 5000) {
  // A base de conhecimento do site entra aqui dentro. Se vier curta é
  // porque o joaquim-knowledge.js não carregou, e espelhar meia persona
  // é pior do que não espelhar nenhuma.
  console.error(`persona demasiado curta (${persona.length} car.) — o joaquim-knowledge carregou?`);
  process.exit(1);
}

const { error } = await sb.from("ai_assistants").update({
  system_prompt: persona,
  // O site continua a poder mandar a sua parte: é lá que vive a carteira
  // de imóveis, que muda todos os dias.
  permite_system_dinamico: true,
}).eq("assistant_key", "terrae-joaquim");

if (error) { console.error("erro:", error.message); process.exit(1); }
console.log(`✓ Joaquim · persona de ${persona.length.toLocaleString("pt-PT")} caracteres no registo`);
console.log("  os ensaios de qualidade passam a falar com o assistente, não com a casca");
