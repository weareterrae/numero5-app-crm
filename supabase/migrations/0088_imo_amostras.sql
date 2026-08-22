-- =====================================================================
-- 0088 — Amostras de comparáveis: a fotografia versionada do mercado
-- ---------------------------------------------------------------------
-- Esta é a peça que resolve o problema que deu origem a tudo.
--
-- Hoje cada avaliação pesquisa a internet outra vez e encontra um
-- conjunto diferente de comparáveis. Medido no mesmo T4 de Carnaxide,
-- com a aritmética já determinística: 938k, 933k e 771k em três
-- execuções — 4 a 6 comparáveis de cada vez, com medianas entre 3671 e
-- 4466 €/m². A conta era idêntica; a amostra é que não era.
--
-- A partir daqui: mesma zona + mesmo perfil + mesma janela = MESMA
-- amostra = MESMO valor. E quando o valor mudar, sabe-se dizer que
-- amostra mudou e porquê.
--
-- Duas regras que não admitem exceção:
--
--   1. Uma amostra usada numa avaliação NUNCA é alterada. Refrescar cria
--      uma amostra nova e deixa a antiga intacta. É isso que torna uma
--      avaliação de há seis meses reproduzível — e é o que um uso
--      profissional exige quando alguém pergunta «porque deram este
--      valor?».
--
--   2. A chave de reutilização tem de ser larga o suficiente para haver
--      reutilização, e estreita o suficiente para os comparáveis serem
--      comparáveis. Faixas de área largas demais misturam mercados;
--      estreitas demais dão uma amostra por imóvel, e volta tudo ao
--      princípio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- FAIXAS DE ÁREA
--
-- Não é um contínuo: são degraus. Um T3 de 118 m² e outro de 125 m²
-- pertencem ao mesmo mercado e têm de partilhar amostra — se cada área
-- exata gerasse a sua, nunca haveria reutilização e o problema mantinha-se.
--
-- Os degraus são mais estreitos em baixo porque em baixo a diferença
-- relativa pesa mais: 40 m² para 60 m² é outro produto; 300 m² para
-- 320 m² não é.
-- ---------------------------------------------------------------------
create or replace function imo_faixa_area(p_area numeric)
returns text language sql immutable as $$
  select case
    when p_area is null or p_area <= 0 then 'desconhecida'
    when p_area <  50 then '0-50'
    when p_area <  75 then '50-75'
    when p_area < 100 then '75-100'
    when p_area < 130 then '100-130'
    when p_area < 170 then '130-170'
    when p_area < 220 then '170-220'
    when p_area < 300 then '220-300'
    when p_area < 450 then '300-450'
    else '450+'
  end;
$$;

comment on function imo_faixa_area(numeric) is
  'Degraus de área para agrupar comparáveis. Larga o suficiente para '
  'haver reutilização, estreita o suficiente para não misturar mercados.';

-- ---------------------------------------------------------------------
-- A CHAVE DE UMA AMOSTRA
--
-- geografia + tipo + tipologia + faixa de área. Dois imóveis com a mesma
-- chave partilham amostra, logo partilham valor base.
-- ---------------------------------------------------------------------
create or replace function imo_chave_amostra(
  p_geografia uuid, p_tipo text, p_tipologia text, p_area numeric
) returns text language sql immutable as $$
  select coalesce(p_geografia::text, 'sem-geo')
    || '|' || imo_chave(coalesce(p_tipo, ''))
    || '|' || imo_chave(coalesce(p_tipologia, ''))
    || '|' || imo_faixa_area(p_area);
$$;

-- ---------------------------------------------------------------------
-- ENCONTRAR A AMOSTRA VÁLIDA
--
-- Devolve a mais recente ainda dentro da validade, ou nada. Quem chama
-- decide se cria uma nova — não se cria aqui, porque criar uma amostra
-- implica ir pesquisar, e isso não é trabalho para uma função de leitura.
-- ---------------------------------------------------------------------
create or replace function imo_amostra_valida(p_chave text)
returns table (
  id uuid, criada_em timestamptz, valida_ate timestamptz,
  n_itens integer, eur_m2_mediano numeric, dispersao numeric, qualidade smallint
)
language sql stable security definer set search_path = public as $$
  select a.id, a.criada_em, a.valida_ate, a.n_itens,
         a.eur_m2_mediano, a.dispersao, a.qualidade
    from imo_amostras a
   where a.chave = p_chave
     and a.valida_ate > now()
     and a.substituida_por is null
   order by a.criada_em desc
   limit 1;
$$;

-- ---------------------------------------------------------------------
-- QUALIDADE DE UM COMPARÁVEL
--
-- 0 a 100. Abaixo de 40 não entra no cálculo; entre 40 e 60 entra com
-- peso reduzido. Sem isto, um anúncio a 8 km com metade da área conta
-- tanto como o apartamento do prédio ao lado.
--
-- Determinística de propósito: os mesmos dados dão sempre a mesma nota,
-- senão a amostra deixava de ser reproduzível.
-- ---------------------------------------------------------------------
create or replace function imo_qualidade_comparavel(
  p_area_alvo numeric, p_area_comp numeric,
  p_tipologia_alvo text, p_tipologia_comp text,
  p_tipo_alvo text, p_tipo_comp text,
  p_distancia_km numeric,
  p_dias_desde_observacao integer
) returns smallint
language sql immutable as $$
  select greatest(0, least(100, (
    -- Área semelhante vale 35 pontos. É o fator que mais determina se
    -- dois imóveis são o mesmo produto.
    35 * (case
      when p_area_alvo is null or p_area_comp is null or p_area_alvo <= 0 then 0.4
      else greatest(0, 1 - abs(p_area_comp - p_area_alvo) / nullif(p_area_alvo, 0) / 0.5)
    end)
    -- Mesma tipologia: 20. Um T2 e um T3 não competem pelo mesmo comprador.
    + 20 * (case
      when p_tipologia_alvo is null or p_tipologia_comp is null then 0.5
      when imo_chave(p_tipologia_alvo) = imo_chave(p_tipologia_comp) then 1
      else 0.2 end)
    -- Mesmo tipo (apartamento/moradia): 15. Trocar isto é trocar de mercado.
    + 15 * (case
      when p_tipo_alvo is null or p_tipo_comp is null then 0.5
      when imo_chave(p_tipo_alvo) = imo_chave(p_tipo_comp) then 1
      else 0 end)
    -- Distância: 20. Mesma freguesia não é mesmo mercado — 300 m valem
    -- mais do que 3 km, e é por isso que se mede em vez de se assumir.
    + 20 * (case
      when p_distancia_km is null then 0.5
      when p_distancia_km <= 0.5 then 1
      when p_distancia_km <= 1.5 then 0.8
      when p_distancia_km <= 3   then 0.55
      when p_distancia_km <= 6   then 0.3
      else 0.1 end)
    -- Frescura: 10. Um anúncio de há seis meses descreve outro mercado.
    + 10 * (case
      when p_dias_desde_observacao is null then 0.5
      when p_dias_desde_observacao <= 30  then 1
      when p_dias_desde_observacao <= 90  then 0.7
      when p_dias_desde_observacao <= 180 then 0.4
      else 0.15 end)
  )::int))::smallint;
$$;

comment on function imo_qualidade_comparavel is
  'Nota 0-100 de um comparável. Determinística: os mesmos dados dão '
  'sempre a mesma nota, senão a amostra deixava de ser reproduzível.';

-- ---------------------------------------------------------------------
-- COBERTURA
--
-- Com três transações reais, medir erro de avaliação é auto-engano. O
-- que se pode medir hoje — e que diz mesmo se o motor está a melhorar —
-- é quanta informação existe, onde, e com que idade.
-- ---------------------------------------------------------------------
create or replace view imo_cobertura
with (security_invoker = true) as
with geo as (
  select g.id, g.nivel, g.nome,
         coalesce(pai.nome, '') as pai
    from imo_geografias g
    left join imo_geografias pai on pai.id = g.pai_id
   where g.ativo and g.nivel in ('concelho', 'freguesia', 'microzona')
)
select
  geo.nivel, geo.nome, geo.pai,
  count(distinct b.id)                                    as benchmarks,
  max(b.periodo_fim)                                      as benchmark_mais_recente,
  sum(coalesce(b.n_transacoes, 0))                        as transacoes_benchmark,
  count(distinct t.id)                                    as vendas_terrae,
  count(distinct a.id) filter (where a.valida_ate > now()) as amostras_validas,
  -- 0-100. Não é uma nota de qualidade do mercado: é uma nota de quanto
  -- SABEMOS sobre ele. Serve para dizer onde vale a pena importar dados.
  least(100,
      (case when count(distinct b.id) > 0 then 40 else 0 end)
    + (case when max(b.periodo_fim) > (current_date - interval '180 days') then 20 else 0 end)
    + least(25, count(distinct t.id)::int * 8)
    + (case when count(distinct a.id) filter (where a.valida_ate > now()) > 0 then 15 else 0 end)
  )::smallint                                             as cobertura
from geo
left join imo_benchmarks b on b.geografia_id = geo.id
left join imo_transacoes  t on t.geografia_id = geo.id
left join imo_amostras    a on a.geografia_id = geo.id
group by geo.nivel, geo.nome, geo.pai
order by cobertura desc, geo.nome;

comment on view imo_cobertura is
  'Quanto sabemos de cada mercado. Com poucas transações, é esta a '
  'métrica útil — não o erro de avaliação, que ainda não é mensurável.';

revoke all on function imo_amostra_valida(text) from public, anon;
grant execute on function imo_amostra_valida(text) to service_role;
grant execute on function imo_chave_amostra(uuid, text, text, numeric) to service_role;
grant execute on function imo_faixa_area(numeric) to service_role;
grant execute on function imo_qualidade_comparavel(numeric, numeric, text, text, text, text, numeric, integer) to service_role;
