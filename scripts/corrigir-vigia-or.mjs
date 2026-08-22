// Muda a verificação de termos de AND (todos) para OR (qualquer um).
//
// Porquê: na primeira ronda real, o Joaquim da Terrae falhou por dizer
// "um único consultor do início à escritura" e "sem dispersão" em vez da
// palavra "exclusivo". A resposta estava perfeita — o alarme é que
// estava errado.
//
// Um vigia que grita sem razão deixa de ser lido, e é nesse dia que o
// alarme a sério passa despercebido. Por isso a regra passa a ser:
// basta UM dos termos aparecer para a resposta contar como no tema.
import { readFileSync, writeFileSync } from "node:fs";

const p = "supabase/functions/ai-vigia/index.ts";
let s = readFileSync(p, "utf8");

const inicio = s.indexOf("    // 4. tem de falar do que interessa");
const fim = s.indexOf("    // 5. diagnósticos");
if (inicio < 0 || fim < 0) { console.error("não encontrei o bloco 4"); process.exit(1); }

const novo = [
  "    // 4. está no tema? Basta UM dos termos — semântica OR de propósito.",
  "    //",
  "    // Com AND, o Joaquim falhou uma vez por dizer \"um único consultor",
  "    // do início à escritura\" em vez da palavra \"exclusivo\": resposta",
  "    // perfeita, alarme falso. Um vigia que grita sem razão deixa de ser",
  "    // lido, e é nesse dia que o alarme a sério passa despercebido.",
  "    const termos = (v.deve_conter ?? []).filter(Boolean);",
  "    if (termos.length > 0) {",
  "      const noTema = termos.some((t: string) => baixo.includes(String(t).toLowerCase()));",
  "      if (!noTema) {",
  "        return { ok: false, motivo: `fora_de_tema:${termos.join(\"|\")}`, status: r.status, ms, amostra };",
  "      }",
  "    }",
  "",
].join("\n");

s = s.slice(0, inicio) + novo + s.slice(fim);
writeFileSync(p, s, "utf8");
console.log("semântica OR aplicada:", /termos\.some/.test(s));
console.log("bloco antigo removido:", !/falta_termo/.test(s));
