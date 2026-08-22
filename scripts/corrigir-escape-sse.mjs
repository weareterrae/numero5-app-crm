// Corrige o escape duplo que o meu gerador introduziu no parser SSE.
// `buf.split("\\n")` divide por barra-invertida-n literal e nunca por
// quebra de linha — partia o parsing por completo, em silêncio.
// Aplicável a qualquer site já migrado.
import { readFileSync, writeFileSync } from "node:fs";

const ficheiro = process.argv[2];
if (!ficheiro) { console.error("uso: node corrigir-escape-sse.mjs <ficheiro>"); process.exit(1); }

let s = readFileSync(ficheiro, "utf8");
const erradoSplit = 'buf.split("' + String.fromCharCode(92, 92, 110) + '")';
const certoSplit = 'buf.split("' + String.fromCharCode(92, 110) + '")';

const tinha = s.includes(erradoSplit);
s = s.split(erradoSplit).join(certoSplit);
writeFileSync(ficheiro, s, "utf8");

const agora = readFileSync(ficheiro, "utf8");
console.log(`${ficheiro}`);
console.log(`  escape duplo encontrado: ${tinha}`);
console.log(`  correto agora: ${agora.includes(certoSplit) && !agora.includes(erradoSplit)}`);
