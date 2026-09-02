-- =====================================================================
-- 0119 · API de dados de mercado: chaves por ferramenta, registo e zonas
-- ---------------------------------------------------------------------
-- O Nuno pediu para ligar várias ferramentas aos dados do MicroSIR. O que
-- existia era a Edge Function imo-dados, feita à medida do motor do site:
-- um endpoint só, autenticado por allowlist de quatro origens escritas no
-- código, sem chave, sem limite, sem registo, e que devolve as vendas
-- reais da Terrae a qualquer origem da lista.
--
-- Isto é o que falta para servir ferramentas em vez de um site:
--
--   imo_ferramentas   uma linha por ferramenta, com a chave em hash,
--                     o que ela pode ver e quanto pode pedir
--   imo_pedidos       um registo por pedido (sem morada nem pessoa)
--   imo_api_registar  a escrita dos dois, atómica
--   imo_api_zonas     a lista das zonas que têm dados, com o último
--                     benchmark de transação de cada uma
--
-- A CHAVE É UM SEGREDO, ao contrário da assistant_key do N5 AI OS, que é
-- pública e só identifica. Uma ferramenta de servidor (Make, n8n, um GPT,
-- um MCP) não tem Origin para a autorizar; a chave tem de autorizar por
-- si. Por isso guarda-se o SHA-256 e nunca a chave: quem ler a tabela não
-- fica com nada que sirva. A chave aparece uma vez, quando se cria
-- (scripts/imo-chave.mjs), e é o Sandro que a entrega.
--
-- O QUE UMA CHAVE PODE, POR OMISSÃO: ler agregados (benchmarks, série,
-- área por código postal, cobertura). Vendas reais da Terrae e pôr códigos
-- postais na fila são flags, desligadas.
--
-- LICENÇA: os benchmarks do SIR e do MicroSIR são para uso das ferramentas
-- da Terrae (cláusula 4.d), só agregados (2.c e 2.d), com a atribuição
-- «© IMOESTATÍSTICA – TODOS OS DIREITOS RESERVADOS» em todas as
-- reproduções. A redistribuição a terceiros não está autorizada
-- (imo_fontes.redistribuicao = false). Uma chave é sempre de uma
-- ferramenta da casa; não é um produto para fora.
--
-- Limites: ai_rate_bump (0072) já faz janelas alinhadas e atómicas; usa-se
-- com scope 'key' (um dos que ai_rate_limits aceita) e scope_key
-- 'imo:<id da ferramenta>'. Não se inventa outro contador.
-- =====================================================================

create table if not exists imo_ferramentas (
  id                     uuid primary key default gen_random_uuid(),
  -- «Assistente comercial do Nuno», «Make · alertas de zona»
  nome                   text not null,
  -- quem pediu e responde por ela
  dono                   text,
  -- SHA-256 (hex) da chave. A chave em claro nunca é guardada.
  chave_hash             text unique not null,
  -- os primeiros 12 caracteres da chave, para se saber de qual se fala
  -- numa lista ou num registo sem a expor
  prefixo                text not null,
  ativo                  boolean not null default true,
  -- Só para ferramentas que corram no browser: origens exactas
  -- (esquema + host). Vazio = ferramenta de servidor; um pedido COM
  -- Origin a uma chave sem origens é recusado, porque uma chave de
  -- servidor num browser é uma chave a fugir.
  allowed_origins        text[] not null default '{}',
  -- o único dado que mais ninguém tem: fora por omissão
  permite_vendas_terrae  boolean not null default false,
  -- pôr códigos postais na fila do MicroSIR custa latência à corrida
  -- diária e, no limite, logins: fora por omissão
  permite_enfileirar     boolean not null default false,
  limite_minuto          integer not null default 60
                         check (limite_minuto between 1 and 10000),
  limite_dia             integer not null default 2000
                         check (limite_dia between 1 and 1000000),
  notas                  text,
  ultima_utilizacao      timestamptz,
  pedidos_total          bigint not null default 0,
  created_at             timestamptz not null default now(),
  revogada_em            timestamptz
);

comment on table imo_ferramentas is
  'Ferramentas autorizadas a ler a camada de dados imobiliária pela Edge '
  'Function imo-api. A chave guarda-se em SHA-256 e mostra-se uma vez, ao '
  'criar (scripts/imo-chave.mjs). Vendas da Terrae e fila do MicroSIR são '
  'flags por chave, desligadas por omissão. Só para ferramentas da casa: '
  'a licença do SIR não permite redistribuição a terceiros.';

create index if not exists imo_ferramentas_prefixo_idx on imo_ferramentas (prefixo);

alter table imo_ferramentas enable row level security;
drop policy if exists imo_ferramentas_staff on imo_ferramentas;
create policy imo_ferramentas_staff on imo_ferramentas
  for select using (n5_is_staff());

-- ---------------------------------------------------------------------
-- O registo. Uma linha por pedido, recusas incluídas. Sem morada, sem
-- pessoa: os parâmetros que ficam são zona, concelho, tipo, tipologia e
-- código postal, que descrevem um sítio e não alguém.
-- ---------------------------------------------------------------------
create table if not exists imo_pedidos (
  id             bigserial primary key,
  ferramenta_id  uuid references imo_ferramentas(id) on delete set null,
  request_id     text not null,
  endpoint       text not null,
  parametros     jsonb not null default '{}'::jsonb,
  -- a fonte principal devolvida (sir-micro, sir, ine), para se saber o
  -- que anda a sair e com que licença
  fonte          text,
  status         integer not null,
  ms             integer,
  created_at     timestamptz not null default now()
);

comment on table imo_pedidos is
  'Registo dos pedidos à imo-api: ferramenta, endpoint, parâmetros de '
  'sítio (nunca de pessoa), fonte devolvida, estado e latência. Uma linha '
  'por pedido, incluindo recusas.';

create index if not exists imo_pedidos_ferramenta_idx on imo_pedidos (ferramenta_id, created_at desc);
create index if not exists imo_pedidos_data_idx on imo_pedidos (created_at);

alter table imo_pedidos enable row level security;
drop policy if exists imo_pedidos_staff on imo_pedidos;
create policy imo_pedidos_staff on imo_pedidos
  for select using (n5_is_staff());

-- ---------------------------------------------------------------------
-- Registar um pedido e contar na ferramenta, num só passo.
-- ---------------------------------------------------------------------
create or replace function imo_api_registar(
  p_ferramenta uuid,
  p_request_id text,
  p_endpoint   text,
  p_parametros jsonb,
  p_fonte      text,
  p_status     integer,
  p_ms         integer
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into imo_pedidos (ferramenta_id, request_id, endpoint, parametros, fonte, status, ms)
  values (p_ferramenta, p_request_id, p_endpoint, coalesce(p_parametros, '{}'::jsonb), p_fonte, p_status, p_ms);
  if p_ferramenta is not null then
    update imo_ferramentas
       set ultima_utilizacao = now(), pedidos_total = pedidos_total + 1
     where id = p_ferramenta;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- As zonas que têm dados. Concelhos, freguesias e microzonas activas,
-- cada uma com o último benchmark de transação de todas as tipologias
-- (a linha geral), e as tipologias que essa colheita trouxe.
--
-- Escalão 1 só: é o que entra no cálculo do site (imo_benchmark, 0113).
-- Uma zona sem linha geral aparece na mesma, com os campos a nulo, para
-- se ver que existe e que ainda não tem colheita.
-- ---------------------------------------------------------------------
create or replace function imo_api_zonas(p_concelho text default null)
returns table (
  geografia_id   uuid,
  nivel          text,
  zona           text,
  concelho       text,
  dicofre        text,
  fonte          text,
  periodo        text,
  periodo_fim    date,
  eur_m2         numeric,
  p25            numeric,
  p75            numeric,
  n_transacoes   integer,
  cobertura_bbox numeric,
  tipologias     text[]
)
language sql stable security definer set search_path = public as $$
  with geo as (
    select g.id, g.nivel, g.nome, g.codigo_ine,
           case g.nivel
             when 'concelho'  then g.nome
             when 'freguesia' then p.nome
             else pp.nome
           end as concelho
      from imo_geografias g
      left join imo_geografias p  on p.id  = g.pai_id
      left join imo_geografias pp on pp.id = p.pai_id
     where g.ativo
       and g.nivel in ('concelho', 'freguesia', 'microzona')
  ),
  ultimo as (
    select distinct on (b.geografia_id)
           b.geografia_id, b.fonte_id, b.periodo, b.periodo_fim,
           coalesce(b.eur_m2_mediano, b.eur_m2_medio) as eur_m2,
           b.eur_m2_p25, b.eur_m2_p75, b.n_transacoes,
           (b.extra ->> 'cobertura_bbox')::numeric as cobertura_bbox
      from imo_benchmarks b
      join imo_fontes f on f.id = b.fonte_id
     where f.escalao = 1
       and b.tipo_imovel = '' and b.tipologia = ''
       and coalesce(b.eur_m2_mediano, b.eur_m2_medio) is not null
       -- Uma linha de concelho DERIVADA pela Terrae (mediana das zonas
       -- do PDF do SIR, extra.derivado) não é uma publicação da
       -- IMOESTATÍSTICA e não pode sair com a atribuição dela. Fica de
       -- fora: a zona aparece sem valores, que é a verdade.
       and coalesce((b.extra ->> 'derivado')::boolean, false) = false
     order by b.geografia_id, b.periodo_fim desc nulls last, b.n_transacoes desc nulls last
  )
  select geo.id, geo.nivel, geo.nome, geo.concelho, geo.codigo_ine,
         u.fonte_id, u.periodo, u.periodo_fim,
         round(u.eur_m2), u.eur_m2_p25, u.eur_m2_p75, u.n_transacoes, u.cobertura_bbox,
         (select array_agg(distinct t.tipologia order by t.tipologia)
            from imo_benchmarks t
           where t.geografia_id = geo.id
             and t.fonte_id = u.fonte_id
             and t.periodo = u.periodo
             and t.tipologia <> '')
    from geo
    left join ultimo u on u.geografia_id = geo.id
   where p_concelho is null
      or imo_chave(coalesce(geo.concelho, '')) = imo_chave(p_concelho)
   order by geo.concelho, geo.nivel, geo.nome
$$;

-- TAMBÉM DE authenticated. No Supabase, uma função criada em public
-- recebe EXECUTE para anon, authenticated e service_role pelos default
-- privileges; revogar de public não retira a entrada explícita de
-- authenticated (as 0081 e 0083 já o fazem assim). Sem isto, qualquer
-- conta da app, incluindo clientes externos, chamava
-- rest/v1/rpc/imo_api_zonas sem chave, sem limite e sem registo.
revoke all on function imo_api_registar(uuid, text, text, jsonb, text, integer, integer) from public, anon, authenticated;
revoke all on function imo_api_zonas(text) from public, anon, authenticated;
grant execute on function imo_api_registar(uuid, text, text, jsonb, text, integer, integer) to service_role;
grant execute on function imo_api_zonas(text) to service_role;

comment on function imo_api_zonas(text) is
  'Zonas com dados para a imo-api: concelhos, freguesias e microzonas com '
  'o último benchmark de transação (linha geral) e as tipologias colhidas. '
  'p_concelho filtra; nulo devolve tudo.';

insert into schema_migrations (version) values ('0119')
on conflict (version) do nothing;
