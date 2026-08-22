/**
 * Nº 5 · Recolha diária de métricas — núcleo partilhado.
 *
 * Toda a lógica de agregação vive AQUI. Nenhum agente deve voltar a escrever
 * código de agregação: a rotina diária só chama `marcas.mjs` e `processar.mjs`.
 * Se o contrato do Metricool mudar, muda-se neste ficheiro e mais nada.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export function env() {
  const txt = fs.readFileSync(path.join(RAIZ, '.env.local'), 'utf8')
  return Object.fromEntries(
    txt.split(/\r?\n/)
      .filter(l => l.includes('=') && !l.trim().startsWith('#'))
      .map(l => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      })
  )
}

export function supa() {
  const e = env()
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

/** Datas do período. `hoje` opcional (AAAA-MM-DD) para poder re-correr um dia passado. */
export function periodo(hoje) {
  const dia = hoje || new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' })
  const fim = new Date(dia + 'T00:00:00Z').getTime()
  const iso = t => new Date(t).toISOString().slice(0, 10)
  const dias = Array.from({ length: 30 }, (_, i) => iso(fim - (29 - i) * 86400000))
  return {
    hoje: dia,
    ini: dias[0],
    dias,
    antIni: iso(fim - 59 * 86400000),
    antFim: iso(fim - 30 * 86400000),
    fimJanela: iso(fim + 20 * 86400000), // Passo 4: hoje..hoje+20 = 21 dias
  }
}

/**
 * Métricas por rede. `atual` = último dia com valor; `soma` = total do período.
 * FBEV20 vem null em todas as marcas desde ago/2026 — fica 0, é o esperado.
 */
export const REDES = {
  instagram: {
    serie: 'IGEV06',
    campos: {
      seguidores: ['IGEV01', 'atual'], ganho: ['IGEV03', 'soma'], alcance: ['IGEV06', 'soma'],
      publicacoes: ['IGEV37', 'soma'], interacoes: ['IGEV38', 'soma'],
      comentarios: ['IGEV14', 'soma'], partilhas: ['IGEV40', 'soma'],
    },
  },
  facebook: {
    serie: 'FBEV20',
    ganhoDiff: ['FBEV47', 'FBEV48'],
    campos: {
      seguidores: ['FBEV17', 'atual'], alcance: ['FBEV20', 'soma'], interacoes: ['FBEV34', 'soma'],
      comentarios: ['FBEV14', 'soma'], partilhas: ['FBEV15', 'soma'], publicacoes: ['FBEV33', 'soma'],
    },
  },
  linkedin: {
    serie: 'LIEV22',
    campos: {
      seguidores: ['LIEV01', 'atual'], ganho: ['LIEV08', 'soma'], alcance: ['LIEV22', 'soma'],
      publicacoes: ['LIEV28', 'soma'], interacoes: ['LIEV23', 'soma'],
      comentarios: ['LIEV20', 'soma'], partilhas: ['LIEV27', 'soma'],
    },
  },
  tiktok: {
    serie: 'TKEV02',
    campos: {
      seguidores: ['TKEV07', 'atual'], ganho: ['TKEV08', 'soma'], alcance: ['TKEV02', 'soma'],
      publicacoes: ['TKEV01', 'soma'], interacoes: ['TKEV06', 'soma'],
      comentarios: ['TKEV04', 'soma'], partilhas: ['TKEV05', 'soma'],
    },
  },
  youtube: {
    serie: 'YTEV02',
    interacoesSoma: ['YTEV10', 'YTEV12', 'YTEV19'],
    campos: {
      seguidores: ['YTEV01', 'atual'], ganho: ['YTEV05', 'soma'], alcance: ['YTEV02', 'soma'],
      publicacoes: ['YTEV04', 'soma'], comentarios: ['YTEV12', 'soma'], partilhas: ['YTEV19', 'soma'],
    },
  },
  gbp: {
    campos: {
      pesquisas: ['GMEV18', 'soma'], maps: ['GMEV19', 'soma'],
      chamadas: ['GMEV22', 'soma'], direcoes: ['GMEV23', 'soma'],
    },
  },
  web: { campos: { visitas: ['WTEV02', 'soma'] } },
}

/** Métricas do conector `posts` do Instagram (para o top_post). */
export const METRICAS_POSTS_IG = ['IGPO01', 'IGPO05', 'IGPO12', 'IGPO14', 'IGPO03']

/** Lista de métricas a pedir ao Metricool para uma rede (sem repetições). */
export function metricasDe(rede) {
  const r = REDES[rede]
  if (!r) throw new Error('rede desconhecida: ' + rede)
  const ids = Object.values(r.campos).map(([id]) => id)
  if (r.ganhoDiff) ids.push(...r.ganhoDiff)
  if (r.interacoesSoma) ids.push(...r.interacoesSoma)
  if (r.serie) ids.push(r.serie)
  return [...new Set(ids)]
}

const num = v => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Indexa a resposta crua do Metricool por dia.
 * Formato: {rows: [[valor1, valor2, ..., "AAAAMMDD"], ...]} — valores na ordem
 * das métricas pedidas, data SEMPRE no último elemento, linhas por ordenar.
 */
function indexar(bruto, metricas) {
  const porData = new Map()
  for (const linha of (bruto && bruto.rows) || []) {
    const d = String(linha[linha.length - 1])
    const dia = d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8)
    const vals = {}
    metricas.forEach((m, i) => { vals[m] = num(linha[i]) })
    porData.set(dia, vals)
  }
  return porData
}

const somaId = (idx, id) => [...idx.values()].reduce((a, v) => a + (v[id] || 0), 0)

const atualId = (idx, dias, id) => {
  for (let i = dias.length - 1; i >= 0; i--) {
    const v = idx.get(dias[i]) && idx.get(dias[i])[id]
    if (v) return v
  }
  return 0
}

const serieId = (idx, dias, id) => dias.map(d => Math.round((idx.get(d) && idx.get(d)[id]) || 0))

/** Agrega uma rede: resposta crua → objeto canónico pronto para a BD. */
export function agregar(rede, bruto, metricas, dias) {
  const r = REDES[rede]
  const idx = indexar(bruto, metricas)
  const out = {}
  for (const [campo, [id, modo]] of Object.entries(r.campos)) {
    out[campo] = Math.round(modo === 'atual' ? atualId(idx, dias, id) : somaId(idx, id))
  }
  if (r.ganhoDiff) out.ganho = Math.round(somaId(idx, r.ganhoDiff[0]) - somaId(idx, r.ganhoDiff[1]))
  if (r.interacoesSoma) out.interacoes = Math.round(r.interacoesSoma.reduce((a, id) => a + somaId(idx, id), 0))
  if (r.serie) {
    out.serie = serieId(idx, dias, r.serie)
    out.alcance_medio = Math.round(out.alcance / 30)
  }
  return out
}

/** Soma simples de uma métrica (usado no alcance do período anterior). */
export function somaMetrica(bruto, metricas, id) {
  return Math.round(somaId(indexar(bruto, metricas), id))
}

/**
 * Melhor post de Instagram do período, a partir do conector `posts`.
 * Sem imagem → null (a app esconde o bloco). As URLs do cdninstagram expiram
 * em poucos dias, por isso isto tem de ser refrescado todos os dias.
 */
export function melhorPost(bruto, metricas) {
  const i = id => metricas.indexOf(id)
  let melhor = null
  for (const l of (bruto && bruto.rows) || []) {
    const imagem = l[i('IGPO05')]
    if (typeof imagem !== 'string' || !imagem.startsWith('http')) continue
    const alcance = num(l[i('IGPO14')])
    const interacoes = num(l[i('IGPO12')])
    if (!melhor || alcance > melhor.alcance || (alcance === melhor.alcance && interacoes > melhor.interacoes)) {
      const texto = String(l[i('IGPO03')] || '')
      const primeira = texto.split(/(?<=[.!?])\s|\n/)[0] || ''
      melhor = {
        imagem,
        alcance: Math.round(alcance),
        interacoes: Math.round(interacoes),
        legenda: primeira.trim().slice(0, 180),
      }
    }
  }
  return melhor
}

/** Estado do Radar a partir da cobertura de agendamentos. */
export function estadoRadar(c, hoje) {
  if (c.falhas && c.falhas.length) return 'vermelho'
  const d = c.proximo_post
    ? Math.round((new Date(c.proximo_post + 'T00:00:00Z') - new Date(hoje + 'T00:00:00Z')) / 86400000)
    : null
  if (d !== null && d <= 3 && c.dias_cobertos >= 6) return 'verde'
  if ((d !== null && d <= 7) || (c.dias_cobertos >= 1 && c.dias_cobertos <= 5)) return 'amarelo'
  return 'vermelho'
}

/** Classifica posts agendados → {proximo_post, dias_cobertos, story_dias, falhas}. */
export function classificarAgendados(posts, hoje) {
  const feed = new Set()
  const stories = new Set()
  const falhas = []
  for (const p of posts || []) {
    if (!p || p.draft === true) continue
    const iso = (p.publicationDate && p.publicationDate.dateTime) || ''
    const dia = iso.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue
    // Só as redes realmente em `providers`: twitterData.type vem sempre "POST"
    // mesmo com o Twitter desligado, e contaria stories como feed.
    let ehStory = false
    let ehFeed = false
    for (const pr of p.providers || []) {
      const bloco = p[pr.network + 'Data']
      const t = bloco && bloco.type
      if (!t) continue
      if (String(t).toUpperCase() === 'STORY') ehStory = true
      else ehFeed = true
      if (['ERROR', 'FAILED', 'REJECTED'].includes(String(pr.status).toUpperCase())) {
        falhas.push({ data: dia, rede: pr.network, motivo: pr.detailedStatus || pr.status })
      }
    }
    if (ehFeed) feed.add(dia)
    if (ehStory) stories.add(dia)
  }
  const futuros = [...feed].filter(d => d >= hoje).sort()
  return {
    proximo_post: futuros[0] || null,
    dias_cobertos: feed.size,
    story_dias: stories.size,
    falhas,
  }
}
