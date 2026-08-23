# Recolha diária de métricas (Resultados + Radar) — receita para a rotina automática

**Objetivo:** todos os dias, atualizar no Supabase do Nº5 as métricas sociais + visitas ao site
(`marca_metricas`) e a cobertura de agendamento (`marca_comunicacao`) de todas as marcas, para os
clientes verem sempre informação fidedigna e datada. Substitui a recolha externa que parou a 7/8/2026.

**Como correr:** os dados vêm do **conector Metricool** (tools `getAnalyticsDataByMetrics` e
`getScheduledPosts`). A escrita no Supabase faz-se com um script **node** temporário na raiz de
`C:\Dev\Numero5\numero5-app-crm` que lê o `.env.local` (usa `@supabase/supabase-js`, service role) e
apaga-se no fim. Supabase project ref: `rycgekqszxyudmchpqvs`.

**Período:** últimos 30 dias — `from` = hoje−30 dias, `to` = hoje (fuso `Europe/Lisbon`, offset +01:00).
Escrever as linhas com `data` = hoje, `periodo_ini` = from, `periodo_fim` = to.

## Marcas (Metricool blog_id ↔ Supabase cliente_id ↔ redes presentes)

| Marca | blog_id | cliente_id | Redes |
|---|---|---|---|
| Terrae | 6354824 | 0eb565fe-f6a4-4ffb-9542-c46ab84c48eb | IG, FB, LinkedIn, TikTok, YouTube, web |
| Água Minda | 6499555 | 841634cb-e805-4f99-b977-83fa586930e9 | IG, FB, web |
| Ekoology | 6368768 | 6af4deb6-3bb4-435f-9876-e89c5edbd839 | IG, FB, web |
| Massa Prima | 6505770 | 581fdfd5-3568-4135-bda5-5a740cd1afc0 | IG, FB, web |
| Quente e Bom | 6362422 | a6f0e000-22df-44d3-9973-fbad97feb7c9 | IG, FB, web |
| Externato Sta Maria | 6575712 | ca5e0470-2179-4cdf-8a56-338a08fd6950 | IG, FB, web |
| Nº 5 | 6591324 | 55fefeb3-ecaa-45ef-a6dd-e78e561adecc | IG, FB, LinkedIn, web |
| Maria Goreti | 6664252 | 4d2fde2c-1545-40fc-a9b5-b9063320ad6b | IG, FB, web |
| Hugo Ferreira | 6699080 | 69f00120-4e11-4bd7-857f-aef294cc43c0 | IG, FB, web |
| Sandra Rafael | 6717358 | 2d9654f4-2de8-4b74-954e-09d54c90f5c4 | IG, FB, LinkedIn, web |

## Códigos das métricas (getAnalyticsDataByMetrics) — a resposta vem em linhas diárias, data na última coluna

- **Instagram** (`metrics` por esta ordem): `["IGEV01","IGEV03","IGEV06","IGEV38","IGEV14","IGEV40","IGEV19","IGEV37"]`
  → seguidores(LAST), ganho(SUM), alcance(SUM), interações(SUM), comentários(SUM), partilhas(SUM), média/post, publicações(SUM)
- **Facebook**: `["FBEV17","FBEV47","FBEV48","FBEV20","FBEV34","FBEV14","FBEV15","FBEV33"]`
  → seguidores(LAST), ganhos(SUM), perdas(SUM), alcance(vem null, usar 0), interações(SUM), comentários, partilhas, publicações. **ganho = ganhos − perdas.**
- **LinkedIn**: `["LIEV01","LIEV08","LIEV22","LIEV28","LIEV23","LIEV20","LIEV04"]`
  → seguidores(LAST), ganho(SUM), impressões=alcance(SUM), interações(SUM), comentários, partilhas, publicações
- **TikTok**: `["TKEV07","TKEV08","TKEV11","TKEV06","TKEV04","TKEV05","TKEV01"]`
  → seguidores(LAST), ganho(SUM), alcance(SUM), interações(SUM), comentários, partilhas, vídeos
- **YouTube**: `["YTEV01","YTEV05","YTEV06","YTEV02","YTEV13","YTEV12","YTEV04"]`
  → subscritores(LAST), ganhos(SUM), perdas(SUM), views=alcance(SUM), views publicados, comentários(SUM), vídeos. **ganho = ganhos − perdas.**
- **Website** (visitas): `["WTEV02","WTEV03","WTEV01"]` → visitas(SUM), visitantes(SUM), páginas(SUM). Escrever como `rede="web"`, campo `visitas`.

> **O que as visitas web medem.** O tag da Metricool (`tracker.metricool.com/resources/be.js`) só
> carrega depois de o visitante aceitar a categoria **Analytics** no banner de cookies, que está
> desligada por defeito (opt-in, como manda o RGPD). Ou seja, `visitas` = visitantes com
> consentimento, não tráfego total — é sempre um valor por baixo. Não é avaria; é a leitura correta
> do campo. Verificado em numerocinco.pt a 14/08/2026.

**Regras de agregação:** `seguidores` = último valor não-nulo por data. Tudo o resto = SUM da coluna.
Ignorar linhas cujo valor é null. Números pequenos (redes novas) são reais — escrever na mesma.

## Tabela `marca_metricas` (uma linha por cliente+rede+data; upsert on_conflict `cliente_id,rede,data`)
Colunas: `cliente_id, data, rede, seguidores, ganho, alcance, interacoes, visitas, publicacoes,
extra jsonb, periodo_ini, periodo_fim, capturado_em`.
`rede` ∈ instagram|facebook|linkedin|tiktok|youtube|web. Em IG pôr `extra.serie` = alcance diário (para o gráfico).
`extra` = { comentarios, partilhas, alcance_medio (IG), serie (IG), visitantes+paginas (web) }.

## `marca_comunicacao` (Radar — cobertura de agendamento)
Para cada marca com blog_id: `getScheduledPosts` (hoje → +30 dias), calcular estado (verde ≥7 dias
cobertos, amarelo 3–6, vermelho <3), `dias_cobertos` (runway até ao último post), `proximo_post`,
`agendados`. Upsert on_conflict `cliente_id`, com `atualizado_em` = agora. Excluir `draft:true`.

## Passos por execução
1. Calcular `from`/`to` (últimos 30 dias) e a data de hoje.
2. Para cada marca, para cada rede que tem: chamar `getAnalyticsDataByMetrics` com os códigos acima.
3. Guardar os dados em bruto; escrever um script node na raiz que agrega (LAST/SUM) e faz upsert em `marca_metricas`.
4. Refrescar `marca_comunicacao` (getScheduledPosts) de todas as marcas.
5. Apagar o script temporário. Reportar um resumo (marcas atualizadas, seguidores/alcance por marca).

> **Nota prática (getScheduledPosts):** a janela completa de 30 dias já ultrapassa quase sempre o
> limite de resposta. Quando o erro diz *"Output has been saved to …tool-results/…txt"*, não repetir
> a chamada: correr node sobre esse ficheiro (`JSON.parse` → filtrar `draft`, ordenar
> `publicationDate.dateTime`) para obter total/primeiro/último sem gastar contexto. Quando o erro é
> o do limite de tokens (sem ficheiro), partir a janela em duas metades.

> Nota: os anúncios Meta NÃO precisam de recolha — o bloco `BlocoAnuncios` lê a Meta ao vivo via
> `orgs.meta_ads_id` + `META_ADS_TOKEN`. Esta receita trata só do orgânico + web + cobertura.
