/**
 * Passo 3→5 da recolha diária: pega nas respostas cruas do Metricool, agrega e
 * grava em marca_metricas + marca_comunicacao. Todo o cálculo é determinístico —
 * nenhum agente precisa de escrever código para isto.
 *
 * Uso:
 *   node scripts/metricas/processar.mjs <pasta-com-os-brutos> [AAAA-MM-DD]
 *
 * Espera um ficheiro <blogId>.json por marca, com as respostas COLADAS TAL E QUAL:
 * {
 *   "cliente_id": "...", "nome": "...",
 *   "analytics": { "instagram": {"rows":[...]}, "facebook": {...}, ... },
 *   "instagram_anterior": {"rows":[...]},
 *   "instagram_posts": {"rows":[...]},
 *   "agendados": [ ... ]        // dispensável se houver METRICOOL_USER_TOKEN
 * }
 *
 * Se `.env.local` tiver METRICOOL_USER_TOKEN + METRICOOL_USER_ID, os agendados
 * são puxados aqui por HTTP (mesmo endpoint da netlify/functions/sync-metricool.mjs)
 * e não precisam de passar pelo contexto de nenhum agente.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  env, supa, periodo, metricasDe, METRICAS_POSTS_IG,
  agregar, somaMetrica, melhorPost, estadoRadar, classificarAgendados,
} from './lib.mjs'

const args = process.argv.slice(2)
const seco = args.includes('--seco') // ensaio: calcula e mostra, não grava
const [pasta, hoje] = args.filter(a => a !== '--seco')
if (!pasta) {
  console.error('uso: node scripts/metricas/processar.mjs <pasta> [AAAA-MM-DD] [--seco]')
  process.exit(1)
}

const p = periodo(hoje)
const e = env()
const sb = supa()
const agora = new Date().toISOString()
const ymd = s => s.replace(/-/g, '')

/** Agendados via API direta (barato). Devolve null se não houver token. */
async function agendadosViaApi(blogId) {
  if (!e.METRICOOL_USER_TOKEN || !e.METRICOOL_USER_ID) return null
  const url = 'https://app.metricool.com/api/v2/scheduler/posts'
    + `?blogId=${encodeURIComponent(blogId)}&userId=${encodeURIComponent(e.METRICOOL_USER_ID)}`
    + `&start=${ymd(p.hoje)}&end=${ymd(p.fimJanela)}`
  try {
    const r = await fetch(url, { headers: { 'X-Mc-Auth': e.METRICOOL_USER_TOKEN, accept: 'application/json' } })
    if (!r.ok) { console.error(`  ! agendados ${blogId}: HTTP ${r.status}`); return null }
    const j = await r.json()
    return Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []
  } catch (err) {
    console.error(`  ! agendados ${blogId}: ${err.message}`)
    return null
  }
}

const ficheiros = fs.readdirSync(pasta).filter(f => /^\d+\.json$/.test(f)).sort()
if (!ficheiros.length) { console.error('nenhum ficheiro <blogId>.json em ' + pasta); process.exit(1) }

const linhas = []
const comms = []
const resumo = []
let viaApi = 0

for (const f of ficheiros) {
  const blogId = f.replace('.json', '')
  const j = JSON.parse(fs.readFileSync(path.join(pasta, f), 'utf8'))
  const base = {
    cliente_id: j.cliente_id, data: p.hoje,
    periodo_ini: p.ini, periodo_fim: p.hoje, capturado_em: agora,
  }
  const redesFeitas = []

  for (const [rede, bruto] of Object.entries(j.analytics || {})) {
    const met = metricasDe(rede)
    const a = agregar(rede, bruto, met, p.dias)
    redesFeitas.push(rede)

    if (rede === 'web') {
      linhas.push({ ...base, rede: 'web', seguidores: 0, ganho: 0, alcance: 0,
        interacoes: 0, publicacoes: 0, visitas: a.visitas, extra: {} })
      continue
    }
    if (rede === 'gbp') {
      const alcance = a.pesquisas + a.maps
      linhas.push({ ...base, rede: 'gbp', seguidores: 0, ganho: 0, alcance,
        interacoes: 0, publicacoes: 0, visitas: null,
        extra: { visualizacoes: alcance, pesquisas: a.pesquisas, direcoes: a.direcoes, chamadas: a.chamadas } })
      continue
    }

    const extra = {
      comentarios: a.comentarios, partilhas: a.partilhas,
      alcance_medio: a.alcance_medio, serie: a.serie,
    }
    if (rede === 'instagram') {
      extra.anterior = { alcance: j.instagram_anterior ? somaMetrica(j.instagram_anterior, ['IGEV06'], 'IGEV06') : 0 }
      const top = j.instagram_posts ? melhorPost(j.instagram_posts, METRICAS_POSTS_IG) : null
      if (top) extra.top_post = top
    }
    linhas.push({ ...base, rede, seguidores: a.seguidores, ganho: a.ganho, alcance: a.alcance,
      interacoes: a.interacoes, publicacoes: a.publicacoes, visitas: null, extra })
  }

  let posts = await agendadosViaApi(blogId)
  if (posts) viaApi++
  else posts = j.agendados || []
  const c = classificarAgendados(posts, p.hoje)
  const estado = estadoRadar(c, p.hoje)
  const dm = d => (d ? d.slice(8, 10) + '-' + d.slice(5, 7) : '—')

  comms.push({
    cliente_id: j.cliente_id, estado, dias_cobertos: c.dias_cobertos,
    proximo_post: c.proximo_post, agendados: [], falhas: c.falhas,
    metricool_blog_id: blogId,
    resumo: `${c.dias_cobertos} dias de feed cobertos, próximo a ${dm(c.proximo_post)}, ${c.story_dias} dias com stories.`,
    atualizado_em: agora,
  })
  resumo.push({ nome: j.nome || blogId, redes: redesFeitas.length, estado })
}

if (seco) {
  for (const l of linhas) {
    const s = l.extra.serie
    console.log(`  [ensaio] ${l.rede.padEnd(10)} seg=${l.seguidores} ganho=${l.ganho} alc=${l.alcance} `
      + `int=${l.interacoes} pub=${l.publicacoes} visitas=${l.visitas} `
      + `serie=${s ? s.length + 'pts' : '—'} top=${l.extra.top_post ? 'sim' : 'não'}`)
  }
  for (const c of comms) console.log(`  [ensaio] radar ${c.estado} · ${c.resumo}`)
} else {
  const r1 = await sb.from('marca_metricas').upsert(linhas, { onConflict: 'cliente_id,rede,data' })
  if (r1.error) { console.error('ERRO marca_metricas:', r1.error.message); process.exit(1) }
  const r2 = await sb.from('marca_comunicacao').upsert(comms, { onConflict: 'cliente_id' })
  if (r2.error) { console.error('ERRO marca_comunicacao:', r2.error.message); process.exit(1) }
}

const ic = { verde: '🟢', amarelo: '🟡', vermelho: '🔴' }
console.log(`data ${p.hoje} · ${p.ini}→${p.hoje} · agendados via API em ${viaApi}/${ficheiros.length} marcas`)
console.log(`${resumo.length} marcas, ${linhas.length} linhas de métricas`)
for (const r of resumo) console.log(`  ${ic[r.estado]} ${r.nome} (${r.redes} redes)`)
