-- =====================================================================
-- 0124 · Avaliação, fase 1: tipologia por classe, coordenadas dos CP7,
--        área local do vizinho, e o registo que o backtest precisa
-- ---------------------------------------------------------------------
-- Decisão do Sandro a 7 de Setembro de 2026: «quero ter o melhor site de
-- avaliação do país». O levantamento do motor e dos dados encontrou
-- quatro coisas que a camada de dados podia resolver sozinha, sem tocar
-- na licença nem na colheita:
--
-- 1. TIPOLOGIA POR CLASSE. O MicroSIR publica «<=T1» e «>=T4» e o
--    carregador guarda-as como T1 e T4. O formulário manda «T0» e «T5 ou
--    maior», e a comparação por igualdade nunca as encontrava: um T0 nas
--    Avenidas Novas era avaliado pela mistura (6 990 €/m²) em vez da
--    classe <=T1 (7 705, +10%); um T5 idem contra >=T4 (-11%). Erro
--    sistemático nas pontas. imo_benchmark passa a normalizar a
--    tipologia pedida para a classe: 0 e 1 -> T1, 4 ou mais -> T4.
--
-- 2. COORDENADAS DOS CÓDIGOS POSTAIS NA BASE. A fila do MicroSIR só
--    andava porque um portátil tinha a cache do GISCO. As coordenadas
--    passam a viver em imo_codigos_postais (197 mil CP7, fonte Eurostat
--    GISCO 2024, CC-BY-SA 4.0), e imo_cp_area preenche-as ao inserir o
--    pendente. A fila deixa de depender do portátil para geocodificar.
--
-- 3. ÁREA LOCAL DO VIZINHO. Em 25 das 30 avaliações emitidas a área a
--    300 m não existia ainda (a primeira avaliação num CP7 nunca a tem;
--    a fila é diária). Quando há um CP7 já colhido a menos de 150 m, o
--    quadrado de 300 m de meia-largura cobre praticamente o mesmo
--    mercado: serve-se essa área, marcada com a origem e a distância,
--    para quem lê saber que não é a do próprio código postal.
--
-- 4. REGISTO PARA O BACKTEST. imo_avaliacoes não guardava o código
--    postal, o event_id nem o modo (teaser rápido vs relatório
--    profundo): 0 das 30 tinham cp. Sem chave, nenhuma venda se liga à
--    avaliação. Passa a guardar os três, e imo_backtest_registar fecha o
--    ciclo quando se souber o preço real.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 2. coordenadas dos CP7
-- ---------------------------------------------------------------------
alter table imo_codigos_postais
  add column if not exists lat               numeric(9,6),
  add column if not exists lng               numeric(9,6),
  add column if not exists coordenadas_fonte text;

comment on column imo_codigos_postais.lat is
  'Centroide do código postal (WGS84). Fonte: Eurostat GISCO, Postal codes 2024, '
  'CC-BY-SA 4.0. Carregado por scripts/imo-cp7-coordenadas-carregar.mjs.';

-- Carregar em lotes: [{cp7, lat, lng}, ...]. Só actualiza os CP7 que
-- existem na tabela; não inventa códigos postais.
create or replace function imo_cp7_coordenadas_carregar(p_payload jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  with dados as (
    select (x ->> 'cp7') as cp7, (x ->> 'lat')::numeric as lat, (x ->> 'lng')::numeric as lng
      from jsonb_array_elements(p_payload) as x
     where (x ->> 'cp7') ~ '^[0-9]{4}-[0-9]{3}$'
       and (x ->> 'lat') is not null and (x ->> 'lng') is not null
  )
  update imo_codigos_postais c
     set lat = d.lat, lng = d.lng, coordenadas_fonte = 'GISCO 2024'
    from dados d
   where c.cp7 = d.cp7;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- 4. o que o registo da avaliação passa a guardar
-- ---------------------------------------------------------------------
alter table imo_avaliacoes
  add column if not exists cp7      text,
  add column if not exists event_id text,
  add column if not exists modo     text
    check (modo is null or modo in ('rapido', 'profundo')),
  -- O cálculo inteiro do núcleo (âncora escolhida e candidatos,
  -- comparáveis com €/m² bruto e ajustado, factor, banda), para se poder
  -- recalcular uma avaliação sem chamar o modelo. A memória em texto
  -- lê-se; isto replaya-se.
  add column if not exists calculo  jsonb;

create index if not exists imo_avaliacoes_event_idx on imo_avaliacoes (event_id);
create index if not exists imo_avaliacoes_cp7_idx on imo_avaliacoes (cp7, created_at desc);

comment on column imo_avaliacoes.modo is
  'rapido = teaser da página (sem pesquisa); profundo = relatório completo. '
  'Cada pedido gera os dois; para medir erro conta-se um por event_id, o profundo.';

-- ---------------------------------------------------------------------
-- 1. imo_benchmark: a tipologia pedida vai à classe que a fonte publica
-- ---------------------------------------------------------------------
-- As classes dependem do tipo: apartamentos publicam-se em <=T1, T2, T3,
-- >=T4; moradias em <=T3 e >=T4 (carregador 0106, linhas 185-187).
create or replace function imo_tipologia_classe(p_tipologia text, p_tipo text default '')
returns text
language sql immutable as $$
  select case
    when p_tipologia is null or btrim(p_tipologia) = '' then ''
    when (regexp_match(p_tipologia, '(\d)'))[1] is null then p_tipologia
    when imo_chave(coalesce(p_tipo, '')) like '%morad%' then
      case when (regexp_match(p_tipologia, '(\d)'))[1]::int >= 4 then 'T4' else 'T3' end
    when (regexp_match(p_tipologia, '(\d)'))[1]::int <= 1 then 'T1'
    when (regexp_match(p_tipologia, '(\d)'))[1]::int >= 4 then 'T4'
    else 'T' || (regexp_match(p_tipologia, '(\d)'))[1]
  end
$$;

comment on function imo_tipologia_classe(text, text) is
  'Leva a tipologia pedida à classe que as fontes publicam. Apartamentos: T0 e '
  'T1 -> T1 («<=T1»), T2, T3, T4 ou maior -> T4 («>=T4»). Moradias: até T3 -> T3 '
  '(«<=T3»), T4 ou maior -> T4. «T5 ou maior», «t3», «T2» e vazio são aceites.';

drop function if exists imo_benchmark(uuid, text, text, integer);

create function imo_benchmark(
  p_geografia uuid, p_tipo text, p_tipologia text,
  p_min_transacoes integer default 8
) returns table (
  benchmark_id uuid, fonte_id text, geografia_id uuid, nivel text,
  nome text, eur_m2 numeric, medida text, n_transacoes integer,
  periodo text, desconto numeric, p25 numeric, p75 numeric, dispersao numeric,
  natureza text, area_base text,
  absorcao_dias integer, yield_bruta numeric, desconto_negociacao numeric,
  eur_m2_novos numeric, eur_m2_usados numeric,
  tipologia_benchmark text,
  tipo_benchmark text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_geo uuid := p_geografia;
  v_tip text := imo_tipologia_classe(p_tipologia, p_tipo);
begin
  while v_geo is not null loop
    return query
      select b.id, b.fonte_id, b.geografia_id, g.nivel, g.nome,
             coalesce(b.eur_m2_mediano, b.eur_m2_medio),
             case when b.eur_m2_mediano is not null then 'mediana' else 'media' end,
             b.n_transacoes, b.periodo, b.desconto_medio,
             b.eur_m2_p25, b.eur_m2_p75, b.dispersao,
             coalesce(b.extra ->> 'natureza', f.tipo),
             b.extra ->> 'area_base',
             b.tempo_absorcao_dias,
             nullif(b.extra ->> 'yield_bruta', '')::numeric,
             nullif(b.extra ->> 'desconto_acumulado', '')::numeric,
             nullif(b.extra ->> 'eur_m2_novos', '')::numeric,
             nullif(b.extra ->> 'eur_m2_usados', '')::numeric,
             coalesce(b.tipologia, ''),
             coalesce(b.tipo_imovel, '')
        from imo_benchmarks b
        join imo_geografias g on g.id = b.geografia_id
        join imo_fontes f on f.id = b.fonte_id
       where b.geografia_id = v_geo
         and f.escalao = 1
         and coalesce(b.eur_m2_mediano, b.eur_m2_medio) is not null
         and (b.tipo_imovel = '' or imo_chave(b.tipo_imovel) = imo_chave(p_tipo))
         and (b.tipologia = '' or imo_chave(b.tipologia) = imo_chave(v_tip))
         and coalesce(b.n_transacoes, 0) >= p_min_transacoes
       order by (b.tipologia <> '')::int desc,
                (b.tipo_imovel <> '')::int desc,
                b.periodo_fim desc nulls last,
                b.n_transacoes desc nulls last
       limit 1;
    if found then return; end if;

    select pai_id into v_geo from imo_geografias where id = v_geo;
  end loop;
end $$;

comment on function imo_benchmark(uuid, text, text, integer) is
  'Escolhe o benchmark mais granular COM amostra suficiente, subindo na '
  'hierarquia até encontrar: tipologia (por classe, 0124) > tipo > período '
  'mais recente (0123) > mais transações. Diz natureza, área base, estado do '
  'mercado, novos/usados e que linha escolheu.';

-- ---------------------------------------------------------------------
-- 3. imo_cp_area: coordenadas da tabela dos CTT e área do vizinho
-- ---------------------------------------------------------------------
drop function if exists imo_cp_area(text, numeric, numeric, uuid);

create function imo_cp_area(
  p_cp7 text,
  p_lat numeric default null,
  p_lng numeric default null,
  p_geografia uuid default null
) returns table (
  r_cp7 text, r_estado text, r_raio_m integer, r_amostra integer,
  r_eur_m2_medio numeric, r_eur_m2_p25 numeric, r_eur_m2_p75 numeric,
  r_colhido_em timestamptz, r_escada jsonb,
  -- NOVO (0124): de onde veio a área. 'proprio' = deste código postal;
  -- 'vizinho' = de um CP7 já colhido a menos de 150 m, identificado.
  r_origem text, r_cp7_origem text, r_distancia_m integer
)
language plpgsql security definer set search_path = public as $$
declare
  v_cp text;
  v_lat numeric;
  v_lng numeric;
  v_linha imo_cp_areas%rowtype;
  v_viz record;
begin
  v_cp := regexp_replace(coalesce(p_cp7, ''), '[^0-9]', '', 'g');
  if length(v_cp) <> 7 then return; end if;
  v_cp := substring(v_cp from 1 for 4) || '-' || substring(v_cp from 5 for 3);

  -- Coordenadas: as que chegam, ou as da tabela dos CTT (GISCO).
  v_lat := p_lat; v_lng := p_lng;
  if v_lat is null then
    select c.lat, c.lng into v_lat, v_lng from imo_codigos_postais c where c.cp7 = v_cp;
  end if;

  select * into v_linha from imo_cp_areas a where a.cp7 = v_cp;

  if v_linha.cp7 is null then
    insert into imo_cp_areas (cp7, lat, lng, geografia_id, coordenadas_em, estado)
    values (v_cp, v_lat, v_lng, p_geografia,
            case when v_lat is not null then now() end, 'pendente')
    on conflict (cp7) do nothing;
  elsif v_linha.lat is null and v_lat is not null then
    update imo_cp_areas a set
      lat = v_lat, lng = v_lng,
      geografia_id = coalesce(p_geografia, a.geografia_id),
      coordenadas_em = now()
     where a.cp7 = v_cp;
  end if;

  -- Caducada volta à fila.
  if v_linha.cp7 is not null and v_linha.estado = 'ok'
     and v_linha.valida_ate is not null and v_linha.valida_ate < now() then
    update imo_cp_areas a set estado = 'pendente' where a.cp7 = v_cp;
    v_linha.estado := 'pendente';
  end if;

  if v_linha.cp7 is not null and v_linha.estado = 'ok' then
    return query select v_linha.cp7, v_linha.estado, v_linha.raio_m, v_linha.amostra,
                        v_linha.eur_m2_medio, v_linha.eur_m2_p25, v_linha.eur_m2_p75,
                        v_linha.colhido_em, v_linha.escada,
                        'proprio'::text, v_linha.cp7, 0;
    return;
  end if;

  -- O VIZINHO. Sem área própria, procura-se um CP7 já colhido e válido a
  -- menos de 150 m (a 38,7° N, 0,00135° de latitude e 0,00173° de
  -- longitude). O quadrado de 300 m de meia-largura à volta dele cobre
  -- praticamente o mesmo mercado que o deste. Vai marcado.
  if v_lat is not null and v_lng is not null then
    select a.*,
           round(6371000 * acos(least(1.0, greatest(-1.0,
             cos(radians(v_lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(v_lng))
             + sin(radians(v_lat)) * sin(radians(a.lat))))))::integer as dist_m
      into v_viz
      from imo_cp_areas a
     where a.estado = 'ok'
       and (a.valida_ate is null or a.valida_ate >= now())
       and a.lat between v_lat - 0.00135 and v_lat + 0.00135
       and a.lng between v_lng - 0.00173 and v_lng + 0.00173
       and a.cp7 <> v_cp
       and coalesce(a.amostra, 0) >= 30
     order by (a.lat - v_lat) ^ 2 + (a.lng - v_lng) ^ 2
     limit 1;
    if v_viz.cp7 is not null and v_viz.dist_m <= 150 then
      return query select v_cp, 'ok'::text, v_viz.raio_m, v_viz.amostra,
                          v_viz.eur_m2_medio, v_viz.eur_m2_p25, v_viz.eur_m2_p75,
                          v_viz.colhido_em, v_viz.escada,
                          'vizinho'::text, v_viz.cp7, v_viz.dist_m;
    end if;
  end if;
end $$;

comment on function imo_cp_area(text, numeric, numeric, uuid) is
  'Área de mercado local de um CP7. Insere «pendente» com coordenadas da tabela '
  'dos CTT quando não existe; devolve a área própria quando está «ok» e válida; '
  'senão a de um CP7 vizinho colhido a menos de 150 m, com r_origem=vizinho e a '
  'distância (0124). Vazio = ainda não há área; serve-se a freguesia.';

-- ---------------------------------------------------------------------
-- 4b. o backtest: fechar o ciclo quando se sabe o preço real
-- ---------------------------------------------------------------------
-- A avaliação original nunca muda (0086). O que se junta é a comparação:
-- de onde veio o preço real (escritura própria, CPCV, o cliente a dizer,
-- avaliação bancária) e quantos dias passaram. Um número único que
-- misturasse escrituras com «acho que foi 400 mil» não se defendia.
alter table imo_backtests
  add column if not exists fonte_preco           text,
  add column if not exists natureza_preco        text
    check (natureza_preco is null or natureza_preco in ('escritura', 'cpcv', 'declaracao_cliente', 'avaliacao_bancaria', 'proxy')),
  add column if not exists dias_desde_avaliacao  integer,
  add column if not exists motor_versao          text,
  add column if not exists notas                 text;

create unique index if not exists imo_backtests_avaliacao_uk on imo_backtests (avaliacao_id);

create or replace function imo_backtest_registar(
  p_avaliacao uuid,
  p_preco_real numeric,
  p_data date default current_date,
  p_natureza text default 'escritura',
  p_fonte text default null,
  p_transacao uuid default null,
  p_notas text default null
) returns table (erro_percentual numeric, dentro_intervalo boolean, dias integer)
language plpgsql security definer set search_path = public as $$
declare v_a imo_avaliacoes%rowtype; v_erro numeric; v_dentro boolean; v_dias integer;
begin
  select * into v_a from imo_avaliacoes a where a.id = p_avaliacao;
  if v_a.id is null then raise exception 'avaliação % não existe', p_avaliacao; end if;
  if not (p_preco_real > 0) then raise exception 'preço real tem de ser positivo'; end if;

  -- Erro com sinal: positivo = avaliámos acima do que se vendeu.
  v_erro := round((v_a.valor_base - p_preco_real) / p_preco_real, 4);
  v_dentro := p_preco_real between coalesce(v_a.valor_min, v_a.valor_base) and coalesce(v_a.valor_max, v_a.valor_base);
  v_dias := p_data - v_a.created_at::date;

  insert into imo_backtests (avaliacao_id, transacao_id, preco_real, data_real, erro_absoluto, erro_percentual,
                             dentro_intervalo, fonte_preco, natureza_preco, dias_desde_avaliacao, motor_versao, notas)
  values (p_avaliacao, p_transacao, p_preco_real, p_data, abs(v_a.valor_base - p_preco_real), v_erro,
          v_dentro, p_fonte, p_natureza, v_dias, v_a.motor_versao, p_notas)
  on conflict (avaliacao_id) do update set
    transacao_id = excluded.transacao_id, preco_real = excluded.preco_real, data_real = excluded.data_real,
    erro_absoluto = excluded.erro_absoluto, erro_percentual = excluded.erro_percentual,
    dentro_intervalo = excluded.dentro_intervalo, fonte_preco = excluded.fonte_preco,
    natureza_preco = excluded.natureza_preco, dias_desde_avaliacao = excluded.dias_desde_avaliacao,
    motor_versao = excluded.motor_versao, notas = excluded.notas;

  return query select v_erro, v_dentro, v_dias;
end $$;

-- As métricas que se publicam quando houver amostra: erro mediano absoluto
-- (MdAPE), % dentro de ±5% e ±10%, cobertura do intervalo e viés, por
-- versão do motor e por natureza do preço real. Só o modo profundo conta,
-- e só uma avaliação por event_id, para não contar o teaser e o relatório
-- do mesmo imóvel como dois acertos.
create or replace view imo_backtest_metricas
with (security_invoker = true) as
with base as (
  select b.*, a.modo, a.event_id
    from imo_backtests b
    join imo_avaliacoes a on a.id = b.avaliacao_id
   where coalesce(a.modo, 'profundo') = 'profundo'
)
select coalesce(motor_versao, 'todas') as motor_versao,
       coalesce(natureza_preco, 'todas') as natureza_preco,
       count(*) as n,
       round((percentile_cont(0.5) within group (order by abs(erro_percentual)::double precision) * 100)::numeric, 2) as mdape_pct,
       round(100.0 * avg(case when abs(erro_percentual) <= 0.05 then 1 else 0 end), 1) as pct_dentro_5,
       round(100.0 * avg(case when abs(erro_percentual) <= 0.10 then 1 else 0 end), 1) as pct_dentro_10,
       round(100.0 * avg(case when dentro_intervalo then 1 else 0 end), 1) as pct_dentro_intervalo,
       round((percentile_cont(0.5) within group (order by erro_percentual::double precision) * 100)::numeric, 2) as vies_mediano_pct,
       round(avg(dias_desde_avaliacao)::numeric) as dias_medios
  from base
 group by grouping sets ((motor_versao, natureza_preco), (motor_versao), (natureza_preco), ());

comment on view imo_backtest_metricas is
  'Erro das avaliações contra preços reais, por versão do motor e natureza do '
  'preço (escritura, cpcv, declaração do cliente, avaliação bancária, proxy). '
  'Publicar só a partir de 30 casos de escritura ou cpcv.';

-- ---------------------------------------------------------------------
-- permissões: só o service_role (0120)
-- ---------------------------------------------------------------------
revoke all on function imo_backtest_registar(uuid, numeric, date, text, text, uuid, text) from public, anon, authenticated;
grant execute on function imo_backtest_registar(uuid, numeric, date, text, text, uuid, text) to service_role;
revoke all on function imo_cp7_coordenadas_carregar(jsonb) from public, anon, authenticated;
revoke all on function imo_benchmark(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function imo_cp_area(text, numeric, numeric, uuid) from public, anon, authenticated;
grant execute on function imo_cp7_coordenadas_carregar(jsonb) to service_role;
grant execute on function imo_benchmark(uuid, text, text, integer) to service_role;
grant execute on function imo_cp_area(text, numeric, numeric, uuid) to service_role;
-- imo_tipologia_classe é pura e sem dados: pode ficar com o default.

insert into schema_migrations (version) values ('0124')
on conflict (version) do nothing;
