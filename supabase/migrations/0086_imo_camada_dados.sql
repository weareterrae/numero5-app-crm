-- =====================================================================
-- 0086 — Terrae Property Data Layer · fundação
-- ---------------------------------------------------------------------
-- O problema que isto resolve, em uma frase: hoje cada avaliação vai à
-- internet outra vez e encontra uma amostra diferente, por isso o valor
-- muda sem o mercado ter mudado.
--
-- Medido a 22/08/2026, no mesmo T4 de Carnaxide, com a aritmética já
-- determinística: 938k, 933k e 771k em três execuções. A conta era a
-- mesma; os comparáveis é que não. 21,7% de dispersão.
--
-- A partir daqui a Terrae passa a ter uma FOTOGRAFIA VERSIONADA do
-- mercado. Quando o valor mudar, sabe-se dizer se mudou porque o mercado
-- mudou — e não porque o modelo respondeu de outra maneira.
--
-- Prefixo `imo_` para não colidir com o `ai_` do gateway: são dois
-- sistemas com ciclos de vida diferentes.
--
-- Nota de âmbito: este schema não foi desenhado só para /avaliacao. As
-- mesmas observações servem pricing de angariação, relatórios de mercado
-- e monitorização de carteira. Por isso `imo_imoveis` existe separado de
-- `imo_observacoes` — o imóvel é estável, o que se observa dele não é.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. GEOGRAFIA — a entidade central
-- ---------------------------------------------------------------------
-- Texto livre não serve. «Linda-a-Velha», «Miraflores» e «Alto de Santa
-- Catarina» pertencem à mesma união de freguesias e são mercados
-- diferentes: foi exatamente isso que uma avaliação descobriu sozinha ao
-- notar que a média da união estava inflacionada por Miraflores.
--
-- Hierarquia por auto-referência: permite acrescentar microzonas sem
-- mexer no schema, e permite subir na hierarquia à procura de amostra
-- suficiente (microzona → freguesia → concelho).
create table if not exists imo_geografias (
  id            uuid primary key default gen_random_uuid(),
  pai_id        uuid references imo_geografias(id) on delete restrict,
  nivel         text not null check (nivel in
                  ('pais','distrito','concelho','freguesia','localidade','microzona')),
  nome          text not null,
  -- normalizado sem acentos nem maiúsculas: é por aqui que se casa o que
  -- vem dos ficheiros, que nunca escrevem igual
  nome_chave    text not null,
  codigo_ine    text,
  codigo_postal text,
  lat           numeric(9,6),
  lng           numeric(9,6),
  -- Uma microzona pode ser desenhada à mão antes de haver dados para a
  -- aprender. `manual` marca-o, para depois se saber o que rever.
  manual        boolean not null default false,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now()
);
-- Unicidade por ÍNDICE, não por restrição, e com o pai normalizado.
--
-- Em Postgres, NULL nunca é igual a NULL: numa restrição `unique (pai_id,
-- nivel, nome_chave)`, duas raízes com pai_id nulo seriam ambas aceites —
-- a unicidade não se aplicaria exatamente onde é mais precisa. Trocar o
-- nulo por um UUID fixo resolve, e só um índice de expressão o permite.
create unique index if not exists imo_geografias_unica
  on imo_geografias (coalesce(pai_id, '00000000-0000-0000-0000-000000000000'::uuid), nivel, nome_chave);
create index if not exists imo_geografias_chave on imo_geografias (nivel, nome_chave);
create index if not exists imo_geografias_pai on imo_geografias (pai_id);

comment on table imo_geografias is
  'Hierarquia geográfica. Existe porque divisões administrativas não são '
  'mercados: uma união de freguesias pode juntar zonas com preços muito '
  'diferentes, e a média dela não descreve nenhuma delas.';

-- ---------------------------------------------------------------------
-- 2. FONTES — com licenciamento, não só com nome
-- ---------------------------------------------------------------------
-- O SIR é licenciado. Podemos calcular com ele; não podemos
-- necessariamente publicar as suas tabelas num relatório de cliente.
-- Sem esta distinção declarada, um relatório viola a licença sem
-- ninguém reparar — e a violação descobre-se pela pior via.
create table if not exists imo_fontes (
  id                    text primary key,
  nome                  text not null,
  -- transacao = preço a que se ESCRITUROU · oferta = preço PEDIDO
  -- contexto  = urbanismo, transportes, notícias (não entra no cálculo)
  tipo                  text not null check (tipo in ('transacao','oferta','contexto')),
  -- 1 = transação, 2 = oferta, 3 = contexto. Menor é mais fiável.
  escalao               smallint not null check (escalao between 1 and 3),
  licenca               text,
  uso_interno           boolean not null default true,
  saida_para_cliente    boolean not null default false,
  redistribuicao        boolean not null default false,
  retencao_meses        integer,
  atribuicao_obrigatoria text,
  notas                 text,
  ativo                 boolean not null default true,
  created_at            timestamptz not null default now()
);

comment on column imo_fontes.saida_para_cliente is
  'Se os VALORES desta fonte podem aparecer num relatório entregue ao '
  'cliente. Falso não impede o cálculo — impede a publicação.';

-- ---------------------------------------------------------------------
-- 3. IMPORTAÇÕES — versionadas, nunca substituídas em silêncio
-- ---------------------------------------------------------------------
create table if not exists imo_importacoes (
  id             uuid primary key default gen_random_uuid(),
  fonte_id       text not null references imo_fontes(id) on delete restrict,
  periodo        text,                      -- '2026-Q2', '2026-08'
  ficheiro_nome  text,
  ficheiro_hash  text not null,             -- SHA-256: apanha o mesmo ficheiro duas vezes
  linhas_total   integer not null default 0,
  linhas_validas integer not null default 0,
  linhas_avisos  integer not null default 0,
  linhas_rejeitadas integer not null default 0,
  mapeamento     jsonb not null default '{}'::jsonb,   -- coluna do ficheiro → campo interno
  estado         text not null default 'CARREGADO' check (estado in
                   ('CARREGADO','VALIDADO','IMPORTADO','PUBLICADO','REJEITADO','SUBSTITUIDO')),
  importado_por  uuid,
  publicado_em   timestamptz,
  substituida_por uuid references imo_importacoes(id) on delete set null,
  notas          text,
  created_at     timestamptz not null default now()
);
-- O mesmo ficheiro da mesma fonte não entra duas vezes por engano. Se
-- for intencional, apaga-se a importação anterior ou marca-se como
-- SUBSTITUIDO — mas tem de ser um ato, não um acidente.
create unique index if not exists imo_importacoes_hash
  on imo_importacoes (fonte_id, ficheiro_hash)
  where estado <> 'REJEITADO';

-- Linha a linha, com o motivo de cada rejeição. Sem isto, «15 rejeitadas»
-- é uma informação inútil: ninguém sabe o que corrigir no ficheiro.
create table if not exists imo_importacao_linhas (
  id            uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references imo_importacoes(id) on delete cascade,
  numero_linha  integer,
  bruto         jsonb not null,
  normalizado   jsonb,
  estado        text not null check (estado in ('VALIDA','AVISO','REJEITADA')),
  motivo        text,
  created_at    timestamptz not null default now()
);
create index if not exists imo_importacao_linhas_imp
  on imo_importacao_linhas (importacao_id, estado);

-- ---------------------------------------------------------------------
-- 4. BENCHMARKS — o que o SIR e o INE dizem de um mercado
-- ---------------------------------------------------------------------
-- O SIR não dá necessariamente imóveis individuais. Dá o mercado por
-- zona, tipologia e período. É assim que se guarda.
create table if not exists imo_benchmarks (
  id             uuid primary key default gen_random_uuid(),
  fonte_id       text not null references imo_fontes(id) on delete restrict,
  importacao_id  uuid references imo_importacoes(id) on delete set null,
  geografia_id   uuid not null references imo_geografias(id) on delete restrict,
  -- Vazio significa «todos», e é vazio em vez de NULO de propósito: numa
  -- restrição de unicidade, NULL nunca é igual a NULL, por isso duas
  -- linhas «todas as tipologias» da mesma zona e período seriam ambas
  -- aceites — e o benchmark daquela zona passava a ter duas verdades.
  tipo_imovel    text not null default '',  -- 'apartamento' | 'moradia' | '' = todos
  tipologia      text not null default '',  -- 'T3' | '' = todas
  periodo        text not null,             -- '2026-Q2'
  periodo_fim    date,                      -- para ordenar e medir frescura

  eur_m2_mediano numeric(10,2),
  eur_m2_medio   numeric(10,2),
  eur_m2_p25     numeric(10,2),
  eur_m2_p75     numeric(10,2),
  preco_mediano  numeric(14,2),
  n_transacoes   integer,
  -- Diferença entre o que se pede e o que se escritura, quando a fonte a
  -- publica. É o número mais valioso de todos para uma avaliação.
  desconto_medio numeric(6,4),
  tempo_absorcao_dias integer,
  dispersao      numeric(6,4),
  extra          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  unique (fonte_id, geografia_id, tipo_imovel, tipologia, periodo)
);
create index if not exists imo_benchmarks_procura
  on imo_benchmarks (geografia_id, tipo_imovel, tipologia, periodo_fim desc);

comment on column imo_benchmarks.n_transacoes is
  'Quantas transações sustentam este número. Uma microzona com uma '
  'transação NÃO tem mais autoridade do que um concelho com trezentas — '
  'é este campo que impede essa inversão.';

-- ---------------------------------------------------------------------
-- 5. IMÓVEIS e OBSERVAÇÕES — o imóvel é estável, o preço não
-- ---------------------------------------------------------------------
create table if not exists imo_imoveis (
  id            uuid primary key default gen_random_uuid(),
  geografia_id  uuid references imo_geografias(id) on delete set null,
  tipo          text,
  tipologia     text,
  area_util     numeric(10,2),
  area_bruta    numeric(10,2),
  lote          numeric(10,2),
  ano           integer,
  estado        text,
  andar         text,
  estacionamento text,
  energetico    text,
  caracteristicas text[],
  lat           numeric(9,6),
  lng           numeric(9,6),
  morada_aprox  text,
  -- Impressão para deduplicação: mesma geografia + tipologia + área
  -- arredondada. Não é infalível, e é por isso que a fusão fica sempre
  -- registada em vez de acontecer em silêncio.
  impressao     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists imo_imoveis_impressao on imo_imoveis (impressao);
create index if not exists imo_imoveis_geo on imo_imoveis (geografia_id, tipo, tipologia);

-- O mesmo imóvel a €620k em março, €599k em abril, €575k em junho e
-- desaparecido em agosto. Guardar só o último preço deita fora a
-- informação mais útil que existe: como o vendedor cedeu.
create table if not exists imo_observacoes (
  id            uuid primary key default gen_random_uuid(),
  imovel_id     uuid not null references imo_imoveis(id) on delete cascade,
  fonte_id      text not null references imo_fontes(id) on delete restrict,
  observado_em  timestamptz not null default now(),
  preco         numeric(14,2),
  eur_m2        numeric(10,2),
  url           text,
  titulo        text,
  estado_anuncio text check (estado_anuncio in
                  ('ATIVO','PRECO_REDUZIDO','REMOVIDO','VENDIDO_CONFIRMADO',
                   'VENDIDO_DESCONHECIDO','RETIRADO','DESCONHECIDO')),
  bruto         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists imo_observacoes_imovel on imo_observacoes (imovel_id, observado_em desc);

comment on column imo_observacoes.estado_anuncio is
  'Um anúncio que desaparece NÃO é uma venda. Pode ter sido retirado, '
  'mudado de agência ou expirado. VENDIDO_CONFIRMADO exige confirmação; '
  'a alternativa honesta é VENDIDO_DESCONHECIDO.';

-- ---------------------------------------------------------------------
-- 6. TRANSAÇÕES REAIS — o ativo que mais vale
-- ---------------------------------------------------------------------
-- Hoje são três linhas num ficheiro JSON. É o único dado que mais
-- ninguém tem, é grátis, e compõe a cada venda. Por isso entra já, e não
-- numa fase seguinte: se cada venda passar por aqui, daqui a um ano são
-- dezenas — e é aí que uma avaliação passa a ser defensável a sério.
create table if not exists imo_transacoes (
  id                uuid primary key default gen_random_uuid(),
  fonte_id          text not null references imo_fontes(id) on delete restrict,
  imovel_id         uuid references imo_imoveis(id) on delete set null,
  geografia_id      uuid references imo_geografias(id) on delete set null,
  referencia        text,
  tipo              text,
  tipologia         text,
  area              numeric(10,2),
  lote              numeric(10,2),
  ano               integer,
  estado            text,
  caracteristicas   text[],
  preco_inicial     numeric(14,2),
  preco_final_pedido numeric(14,2),
  preco_transacao   numeric(14,2) not null,
  data_anuncio      date,
  data_transacao    date,
  dias_mercado      integer,
  n_visitas         integer,
  n_propostas       integer,
  notas             text,
  created_at        timestamptz not null default now()
);
create index if not exists imo_transacoes_geo
  on imo_transacoes (geografia_id, tipo, tipologia, data_transacao desc);

-- ---------------------------------------------------------------------
-- 7. AMOSTRAS — a fotografia versionada do mercado
-- ---------------------------------------------------------------------
-- A peça que resolve o problema original. Uma amostra é o conjunto de
-- comparáveis de uma zona + tipo + tipologia + faixa de área, com
-- validade. Enquanto for válida, todas as avaliações do mesmo perfil
-- usam a MESMA amostra — logo dão o MESMO valor.
--
-- Uma amostra usada numa avaliação NUNCA é alterada. Um refrescamento
-- cria uma amostra nova. É isso que torna uma avaliação reproduzível
-- meses depois, que é o que um uso profissional exige.
create table if not exists imo_amostras (
  id            uuid primary key default gen_random_uuid(),
  geografia_id  uuid not null references imo_geografias(id) on delete restrict,
  tipo          text,
  tipologia     text,
  area_min      numeric(10,2),
  area_max      numeric(10,2),
  -- Chave de reutilização: mesma chave + dentro da validade = mesma amostra.
  chave         text not null,
  criada_em     timestamptz not null default now(),
  valida_ate    timestamptz not null,
  n_itens       integer not null default 0,
  eur_m2_mediano numeric(10,2),
  dispersao     numeric(6,4),
  qualidade     smallint,                  -- 0-100, do conjunto
  substituida_por uuid references imo_amostras(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists imo_amostras_chave on imo_amostras (chave, valida_ate desc);

create table if not exists imo_amostra_itens (
  id            uuid primary key default gen_random_uuid(),
  amostra_id    uuid not null references imo_amostras(id) on delete cascade,
  imovel_id     uuid references imo_imoveis(id) on delete set null,
  fonte_id      text references imo_fontes(id) on delete set null,
  titulo        text,
  url           text,
  preco         numeric(14,2),
  area          numeric(10,2),
  eur_m2        numeric(10,2),
  distancia_km  numeric(8,3),
  -- 0-100. Abaixo do limiar não entra no cálculo, ou entra com peso baixo.
  qualidade     smallint,
  motivo_qualidade jsonb not null default '{}'::jsonb,
  bruto         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists imo_amostra_itens_amostra on imo_amostra_itens (amostra_id);

-- ---------------------------------------------------------------------
-- 8. AVALIAÇÕES — reproduzíveis, com tudo o que as explica
-- ---------------------------------------------------------------------
create table if not exists imo_avaliacoes (
  id               uuid primary key default gen_random_uuid(),
  referencia       text,
  motor_versao     text not null,
  geografia_id     uuid references imo_geografias(id) on delete set null,
  imovel           jsonb not null,           -- o que se avaliou, tal como entrou
  amostra_id       uuid references imo_amostras(id) on delete set null,
  benchmark_id     uuid references imo_benchmarks(id) on delete set null,
  benchmark_nivel  text,                     -- 'terrae' | 'sir_microzona' | 'ine_freguesia' | ...

  valor_base       numeric(14,2),
  valor_min        numeric(14,2),
  valor_max        numeric(14,2),
  eur_m2           numeric(10,2),
  confianca_pct    smallint,
  confianca_banda  text,
  -- Diferença entre o que se pede e o que se escritura, nesta zona e
  -- neste momento. Alimenta o valor, a confiança e o comentário.
  gap_mercado      numeric(6,4),
  memoria          jsonb not null default '[]'::jsonb,
  -- Quando o modelo discorda do número, fica aqui. Nunca o substitui.
  aviso_llm        text,
  created_at       timestamptz not null default now()
);
create index if not exists imo_avaliacoes_ref on imo_avaliacoes (referencia, created_at desc);

-- ---------------------------------------------------------------------
-- 9. BACKTESTS — a única forma de saber se isto funciona
-- ---------------------------------------------------------------------
-- A avaliação original NUNCA é alterada depois de se conhecer o preço de
-- venda. Guardar a comparação à parte é o que permite medir sem
-- contaminar.
create table if not exists imo_backtests (
  id               uuid primary key default gen_random_uuid(),
  avaliacao_id     uuid not null references imo_avaliacoes(id) on delete cascade,
  transacao_id     uuid references imo_transacoes(id) on delete set null,
  preco_real       numeric(14,2) not null,
  data_real        date,
  erro_absoluto    numeric(14,2),
  erro_percentual  numeric(8,4),
  dentro_intervalo boolean,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 10. QUALIDADE DOS DADOS — fila de problemas, não relatório morto
-- ---------------------------------------------------------------------
create table if not exists imo_problemas_dados (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null,             -- 'area_em_falta','eur_m2_estranho','duplicado',...
  severidade    text not null default 'aviso' check (severidade in ('info','aviso','grave')),
  tabela        text,
  registo_id    uuid,
  detalhe       jsonb not null default '{}'::jsonb,
  resolvido     boolean not null default false,
  resolvido_em  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists imo_problemas_abertos
  on imo_problemas_dados (resolvido, severidade, created_at desc);

-- ---------------------------------------------------------------------
-- RLS — operação de mercado é da equipa
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'imo_geografias','imo_fontes','imo_importacoes','imo_importacao_linhas',
    'imo_benchmarks','imo_imoveis','imo_observacoes','imo_transacoes',
    'imo_amostras','imo_amostra_itens','imo_avaliacoes','imo_backtests',
    'imo_problemas_dados'
  ] loop
    -- O nome da política tem de ser UM identificador. `%I_staff` produzia
    -- `"imo_geografias"_staff` — as aspas fecham antes do sufixo e o
    -- comando não é sequer válido. Compõe-se o nome primeiro.
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_staff', t);
    execute format('create policy %I on %I for select using (n5_is_staff())', t || '_staff', t);
  end loop;
end $$;
