/**
 * Passo 1+2 da recolha diária: descobre as marcas na BD e cruza-as com as redes
 * ligadas no Metricool, devolvendo o PLANO DE TRABALHO já pronto.
 *
 * Uso:
 *   node scripts/metricas/marcas.mjs <ficheiro-getBrandSettings.json> [AAAA-MM-DD]
 *
 * O ficheiro é a resposta crua de getBrandSettings, colada tal e qual.
 * Saída: JSON com {periodo, marcas:[{blogId, cliente_id, nome, pedidos:[{rede, metricas}]}]}
 * O agente limita-se a executar os `pedidos` — não decide nada.
 */
import fs from 'node:fs'
import { supa, periodo, metricasDe, METRICAS_POSTS_IG } from './lib.mjs'

const [ficheiro, hoje] = process.argv.slice(2)
if (!ficheiro) {
  console.error('falta o ficheiro com a resposta de getBrandSettings')
  process.exit(1)
}

const p = periodo(hoje)
const settings = JSON.parse(fs.readFileSync(ficheiro, 'utf8'))
const porBlog = new Map((settings.data || []).map(b => [String(b.id), b.networksData || {}]))

const sb = supa()
const { data, error } = await sb
  .from('clientes')
  .select('id, nome_marca, metricool_blog_id')
  .not('metricool_blog_id', 'is', null)
if (error) {
  console.error('ERRO a ler clientes:', error.message)
  process.exit(1)
}

const CHAVES = {
  instagram: 'instagramData', facebook: 'facebookData', linkedin: 'linkedinData',
  tiktok: 'tiktokData', youtube: 'youtubeData', gbp: 'gbpData', web: 'webData',
}

const marcas = []
const semSettings = []
for (const c of data) {
  const blogId = String(c.metricool_blog_id)
  const redes = porBlog.get(blogId)
  if (!redes) { semSettings.push(c.nome_marca); continue }
  const pedidos = []
  for (const [rede, chave] of Object.entries(CHAVES)) {
    if (redes[chave]) pedidos.push({ rede, metricas: metricasDe(rede) })
  }
  if (redes.instagramData) {
    pedidos.push({ rede: 'instagram_anterior', metricas: ['IGEV06'], de: p.antIni, a: p.antFim })
    pedidos.push({ rede: 'instagram_posts', metricas: METRICAS_POSTS_IG })
  }
  marcas.push({ blogId, cliente_id: c.id, nome: c.nome_marca, pedidos })
}

console.log(JSON.stringify({
  periodo: { de: p.ini, a: p.hoje, anterior: [p.antIni, p.antFim], janela_agendados: [p.hoje, p.fimJanela] },
  marcas,
  avisos: semSettings.length ? ['sem getBrandSettings: ' + semSettings.join(', ')] : [],
}, null, 1))
