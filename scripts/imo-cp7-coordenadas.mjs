// Constrói a cache local de coordenadas por código postal (CP7).
//
//   node scripts/imo-cp7-coordenadas.mjs                  # descarrega o GISCO e constrói
//   node scripts/imo-cp7-coordenadas.mjs C:/x/PCODE.gpkg  # a partir de um ficheiro já descarregado
//
// Escreve `.cache-cp7-coordenadas.csv` na raiz do repo (cp7,lat,lng), que
// o `imo-cp-fila.mjs` lê todos os dias para dar coordenadas aos códigos
// postais que o site pôs na fila.
//
// PORQUE É PRECISO
//
// O Micro-SIR georreferencia pelo centroide do CP7, e a colheita por
// pontos exige lat/lng por ponto. O site só sabe o código postal; a
// avaliação regista-o «pendente» sem coordenadas, e a fila (imo_cp_fila)
// só devolve linhas COM coordenadas. Entre 23-08 e 02-09 ficaram 22
// códigos postais parados por isto, sem nenhum aviso.
//
// A FONTE, E PORQUE ESTA
//
// Eurostat GISCO, «Postal codes 2024», pacote GeoPackage. É o mesmo
// ficheiro de onde já vem a freguesia (imo-carregar-freguesias.mjs), na
// versão com geometria: um ponto por código postal, em WGS84.
//
//   Licença: CC-BY-SA 4.0
//   Atribuição obrigatória: «© European Union - GISCO, 2024,
//   postal code point dataset, Licence CC-BY-SA 4.0»
//
// O geoapi.pt foi posto de lado pela mesma razão de sempre: 5 pedidos por
// dia sem chave, e a chave é uma subscrição paga.
//
// O GeoPackage tem 206 MB e a Europa inteira. Descarrega-se uma vez para
// a pasta temporária, tiram-se os ~200 mil pontos de Portugal, escreve-se
// o CSV (uns 6 MB) e apaga-se o ficheiro grande. O CSV está no .gitignore
// com os outros `.cache-*.csv`.
import { DatabaseSync } from "node:sqlite";
import { createWriteStream, existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const FONTE = "https://gisco-services.ec.europa.eu/distribution/v2/pcode/gpkg/PCODE_PT_2024_4326.gpkg";
const ATRIBUICAO = "© European Union - GISCO, 2024, postal code point dataset, Licence CC-BY-SA 4.0";
const DESTINO = new URL("../.cache-cp7-coordenadas.csv", import.meta.url);

const dado = process.argv[2];
let gpkg = dado || join(tmpdir(), "PCODE_PT_2024_4326.gpkg");

if (!existsSync(gpkg)) {
  process.stdout.write("a descarregar o GISCO GeoPackage (≈206 MB)… ");
  const r = await fetch(FONTE);
  if (!r.ok || !r.body) { console.error(`HTTP ${r.status}`); process.exitCode = 1; }
  else {
    await pipeline(Readable.fromWeb(r.body), createWriteStream(gpkg));
    console.log(`feito (${Math.round(statSync(gpkg).size / 1e6)} MB)`);
  }
}

if (existsSync(gpkg)) {
  const db = new DatabaseSync(gpkg, { readOnly: true });
  const g = db.prepare("select table_name, column_name from gpkg_geometry_columns").get();
  if (!g) { console.error("o GeoPackage não tem tabela de geometria"); process.exitCode = 1; }
  else {
    const q = db.prepare(`select POSTCODE as cp7, "${g.column_name}" as geom from "${g.table_name}" where CNTR_ID = 'PT'`);
    const linhas = [];
    let semPonto = 0;
    for (const r of q.iterate()) {
      const cp7 = String(r.cp7 ?? "").trim();
      if (!/^\d{4}-\d{3}$/.test(cp7)) continue;
      const p = pontoDoGPB(r.geom);
      if (!p) { semPonto++; continue; }
      linhas.push(`${cp7},${p.lat.toFixed(6)},${p.lng.toFixed(6)}`);
    }
    db.close();
    linhas.sort();
    writeFileSync(DESTINO, `# ${ATRIBUICAO}\n# cp7,lat,lng\n${linhas.join("\n")}\n`);
    console.log(`${linhas.length.toLocaleString("pt-PT")} códigos postais portugueses com coordenadas → ${DESTINO.pathname}`);
    if (semPonto) console.log(`${semPonto} sem ponto (ignorados)`);
    console.log(ATRIBUICAO);
    if (!dado) { unlinkSync(gpkg); console.log("ficheiro grande apagado da pasta temporária"); }
  }
}

/**
 * Lê um ponto de um GeoPackageBinary (cabeçalho GP + WKB).
 *
 * Cabeçalho: «GP», versão, flags, srs_id (4 bytes) e um envelope
 * opcional cujo tamanho vem nos bits 1-3 das flags. Depois vem o WKB:
 * ordem de bytes, tipo (1 = ponto, com variantes Z/M/SRID) e x, y.
 * Em 4326, x é a longitude e y a latitude.
 */
function pontoDoGPB(buf) {
  if (!buf || buf.length < 8) return null;
  const b = Buffer.from(buf);
  if (b[0] !== 0x47 || b[1] !== 0x50) return null;
  const flags = b[3];
  const envelope = [0, 32, 48, 48, 64][(flags >> 1) & 7] ?? 0;
  let o = 8 + envelope;
  if (b.length < o + 21) return null;
  const little = b[o] === 1; o += 1;
  let tipo = little ? b.readUInt32LE(o) : b.readUInt32BE(o); o += 4;
  if (tipo & 0x20000000) { tipo &= ~0x20000000; o += 4; } // SRID embebido
  if (tipo % 1000 !== 1) return null; // não é um ponto
  if (b.length < o + 16) return null;
  const x = little ? b.readDoubleLE(o) : b.readDoubleBE(o);
  const y = little ? b.readDoubleLE(o + 8) : b.readDoubleBE(o + 8);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { lng: x, lat: y };
}
