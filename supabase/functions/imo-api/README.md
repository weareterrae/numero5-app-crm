# imo-api · a camada de dados de mercado servida a ferramentas

`https://rycgekqszxyudmchpqvs.supabase.co/functions/v1/imo-api`

Serve, por HTTP e com chave por ferramenta, o que o Actor do Apify colhe no
MicroSIR (Confidencial Imobiliário) e o que mais vive nas tabelas `imo_*`:
benchmarks de transação por zona e tipologia, a série mensal, a área de
mercado à volta de um código postal, a cobertura, as fontes e as licenças.

Existe para o Nuno poder ligar várias ferramentas (assistentes, Make,
GPTs, MCP) aos mesmos dados sem lhes dar uma chave de base de dados nem as
credenciais do MicroSIR. A `imo-dados` continua a servir o site; esta
serve ferramentas.

## O que não faz, de propósito

- Não chama o Actor a pedido. Cada corrida é um login no MicroSIR, e a
  licença pede que não se concorra com a exploração normal da fonte. A
  colheita por zonas é mensal (dia 3, 04:00, no Apify) e a fila de códigos
  postais corre todos os dias às 09:00 com um único login. Quem precisa de
  um código postal novo põe-no na fila e volta no dia seguinte.
- Não devolve nada que não seja agregado. Sem transações individuais.
- Não cria chaves. Isso faz-se no portátil, com a chave de serviço:
  `node scripts/imo-chave.mjs criar "Nome" --dono "Quem"`.

## Autenticação

Header `Authorization: Bearer imo_…` (ou `X-Imo-Key: imo_…`). As chaves
vivem em `imo_ferramentas` como SHA-256; cada uma tem nome, dono, limites
por minuto e por dia, e duas permissões desligadas por omissão:

| flag | o que abre |
| --- | --- |
| `permite_vendas_terrae` | `GET /mercado?vendas=1` devolve as escrituras da Terrae na zona |
| `permite_enfileirar` | `POST /fila` põe um código postal na fila do MicroSIR |

Um pedido com header `Origin` (browser) só passa se a chave declarar essa
origem em `allowed_origins`. Chaves de servidor não têm origens e não
servem browsers.

Gerir chaves:

```bash
node scripts/imo-chave.mjs criar "Assistente do Nuno" --dono "Nuno Santos"
node scripts/imo-chave.mjs criar "Make · alertas" --dono "Nuno Santos" --enfileirar --minuto 30 --dia 500
node scripts/imo-chave.mjs listar
node scripts/imo-chave.mjs revogar imo_ab12cd34
```

## Endpoints

Todos devolvem JSON com `ok`, `dados`, `licenca` e `meta` (request_id,
versão, ms). Erros vêm como `{ok:false, erro, mensagem, terminal}`;
`terminal:true` quer dizer «não repitas o pedido tal como está».

### `GET /saude`

Sem chave. `{ok, servico, versao, hora}`. Para vigias.

### `GET /fontes`

As fontes com natureza (transação/oferta/contexto), escalão (1 entra no
cálculo), se são publicáveis, se podem ser redistribuídas, e a atribuição
obrigatória.

### `GET /zonas?concelho=Oeiras`

Concelhos, freguesias e microzonas activas (os 18 concelhos da AML) com o
último benchmark de transação de todas as tipologias: `eur_m2`, `p25`,
`p75`, `n_transacoes`, `periodo`, `cobertura_bbox` e as `tipologias` que
essa colheita trouxe. Zonas sem colheita vêm com os campos a nulo. Serve
para descobrir os nomes exactos a mandar em `/mercado`.

### `GET /mercado?zona=Carnaxide e Queijas&concelho=Oeiras&tipo=apartamento&tipologia=T3`

O retrato de uma zona:

- `benchmark`: a linha mais específica que existir (tipologia > tipo >
  todas), a subir na hierarquia se a zona não tiver dados. Traz `eur_m2`,
  `medida`, `p25`, `p75`, `dispersao`, `n_transacoes`, `periodo`,
  `natureza`, `area_base`, `desconto` (price gap, sinal, nunca factor),
  `mercado{absorcao_dias, yield_bruta, desconto_negociacao}`,
  `eur_m2_novos`, `eur_m2_usados`, `tipologia_benchmark`,
  `tipo_benchmark`, `referencia_generica`, `cobertura_bbox`,
  `n_observacoes`, `colhido_em`, `janela_meses`, `avisos_colheita`.
- `geral`: a linha de todas as tipologias da mesma zona, quando é outra.
- `serie`: os períodos dessa linha, na mesma fonte.
- `vendas_terrae`: só com `&vendas=1` e chave com permissão.

`tipo` aceita `apartamento`, `moradia` ou vazio; `tipologia` aceita `T0` a
`T6` ou vazio. Sem `zona`, usa o concelho.

### `GET /serie?zona=…&concelho=…&tipo=…&tipologia=…`

A série ao nível EXACTO pedido, sem subir na hierarquia, por fonte de
transação. Uma série que muda de zona a meio mente sobre o mercado.

### `GET /codigo-postal?cp7=2790-008`

- `sitio`: concelho, distrito, localidade, designação postal, `zona`
  (freguesia quando a sabemos), `ruas` (ficheiro aberto dos CTT).
- `area_local`: `estado` `ok` com `raio_m` (meia-largura do quadrado),
  `amostra`, `eur_m2`, `p25`, `p75`, `colhido_em`, `valida_ate`,
  `escada`; ou `pendente` / `erro` / `sem_area` / `caducada` /
  `nao_pedido`, com uma nota que diz o que fazer.
- `mercado_zona`: o benchmark geral da zona do código postal.

### `GET /fila` e `POST /fila {"cp7":"2790-008"}`

O estado da fila (contagem por estado, pendentes sem coordenadas, últimos
colhidos) e, com permissão, pôr um código postal na fila. `202` quando
fica pendente, `200` com a área se já existia.

## Limites e registo

Por chave: `limite_minuto` (60 por omissão) e `limite_dia` (2000), com
`429` e `retry-after`. Cada pedido, recusas incluídas, fica em
`imo_pedidos` (ferramenta, endpoint, parâmetros de sítio, fonte, estado,
latência, request_id). Nunca uma morada nem uma pessoa.

## Licença

Vai em todas as respostas, em `licenca.fontes[<fonte>]` (`publicavel`,
`atribuicao`) e `licenca.regras`. Em resumo:

1. Só agregados. Nunca reconstruir uma transação individual.
2. A atribuição de cada fonte vai junto de qualquer valor publicado, com
   as palavras exactas. SIR e MicroSIR: «© IMOESTATÍSTICA – TODOS OS
   DIREITOS RESERVADOS». INE: «Instituto Nacional de Estatística».
3. Uso interno das ferramentas da Terrae. Sem redistribuição a terceiros
   (`imo_fontes.redistribuicao = false`).
4. Nulo é «a fonte não divulga a esta granularidade». Nunca 0.
5. €/m² do SIR e do MicroSIR são preços de VENDA sobre área bruta
   privativa. Não aplicar price gap.

## Exemplos

```bash
curl -s -H "Authorization: Bearer $IMO" "https://rycgekqszxyudmchpqvs.supabase.co/functions/v1/imo-api/zonas?concelho=Oeiras"
curl -s -H "Authorization: Bearer $IMO" "https://rycgekqszxyudmchpqvs.supabase.co/functions/v1/imo-api/mercado?zona=Carnaxide%20e%20Queijas&concelho=Oeiras&tipologia=T3"
curl -s -H "Authorization: Bearer $IMO" "https://rycgekqszxyudmchpqvs.supabase.co/functions/v1/imo-api/codigo-postal?cp7=2790-008"
curl -s -X POST -H "Authorization: Bearer $IMO" -H "content-type: application/json" -d '{"cp7":"2795-229"}' "https://rycgekqszxyudmchpqvs.supabase.co/functions/v1/imo-api/fila"
```

## Publicar

```bash
node scripts/publicar-funcao.mjs imo-api          # actualizar
node scripts/publicar-funcao.mjs imo-api --criar  # só a primeira vez
```

A migração `0119_imo_api_ferramentas.sql` cria `imo_ferramentas`,
`imo_pedidos`, `imo_api_registar` e `imo_api_zonas`. Aplica-se com
`node scripts/aplicar-migracao.mjs supabase/migrations/0119_imo_api_ferramentas.sql`.

## MCP

Há um servidor MCP (stdio) em `C:/Users/sandr/terrae-imo-mcp` que expõe
estes endpoints como ferramentas ao Claude Desktop e ao Claude Code. Ver
o `SETUP.md` dessa pasta. Ferramentas que não falem MCP (Make, n8n, GPTs)
chamam a API directamente; o `openapi.yaml` ao lado descreve-a.
