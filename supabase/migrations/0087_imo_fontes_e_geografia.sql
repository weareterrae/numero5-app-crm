-- =====================================================================
-- 0087 — Fontes, licenciamento e a geografia de arranque
-- ---------------------------------------------------------------------
-- Semeia o que a camada precisa para funcionar no primeiro dia:
--
--   · o registo de fontes, COM as regras de licença de cada uma;
--   · a hierarquia geográfica dos concelhos onde a Terrae trabalha;
--   · as microzonas que já se sabe serem mercados distintos;
--   · e a função que escolhe o benchmark certo.
--
-- As microzonas não são uma abstração: uma avaliação descobriu sozinha
-- que a média da união de freguesias de Algés/Linda-a-Velha/Cruz
-- Quebrada estava inflacionada por Miraflores e Alto de Santa Catarina.
-- Tratar isso como um mercado só é o erro que este schema veio impedir.
-- =====================================================================

-- ---------------------------------------------------------------------
-- FONTES
-- ---------------------------------------------------------------------
insert into imo_fontes (id, nome, tipo, escalao, licenca, uso_interno,
                        saida_para_cliente, redistribuicao, atribuicao_obrigatoria, notas)
values
  -- ESCALÃO 1 — preço a que se ESCRITUROU. É o que interessa a uma avaliação.
  ('terrae', 'Vendas reais Terrae', 'transacao', 1, 'proprio',
   true, true, false, null,
   'O ativo próprio. Único dado que mais ninguém tem e que compõe a cada venda.'),

  ('sir', 'SIR · Confidencial Imobiliário', 'transacao', 1, 'licenciado',
   true, false, false, 'Confidencial Imobiliário · SIR',
   'LICENCIADO. Sem API — entra por importação manual de exports legítimos. '
   'Pode ser usado no CÁLCULO; as suas tabelas NÃO podem ser publicadas num '
   'relatório de cliente. É por isso que saida_para_cliente é falso.'),

  ('ine', 'INE · preços de alojamentos familiares', 'transacao', 1, 'publico',
   true, true, true, 'Instituto Nacional de Estatística',
   'Público. Mediana de escritura por freguesia/concelho, já embutida em '
   'ine-ancora.js. Menos granular que o SIR, mas sem restrições.'),

  -- ESCALÃO 2 — preço PEDIDO. Diz o que há à venda, não a que se fecha.
  ('portais', 'Portais imobiliários', 'oferta', 2, 'observacao_publica',
   true, false, false, null,
   'Idealista, Imovirtual, Casa Sapo e afins. Preço PEDIDO: sobrevaloriza '
   'sistematicamente. Serve para stock, concorrência e tempo no mercado.'),

  -- ESCALÃO 3 — contexto. Não entra na aritmética.
  ('contexto', 'Contexto urbano', 'contexto', 3, 'publico',
   true, true, false, null,
   'Urbanismo, transportes, escolas, obras, notícias. Alimenta a leitura do '
   'modelo, NUNCA o cálculo. Misturar isto com números é como se inventam '
   'ajustes que ninguém consegue defender.')
on conflict (id) do update set
  nome = excluded.nome, tipo = excluded.tipo, escalao = excluded.escalao,
  licenca = excluded.licenca, uso_interno = excluded.uso_interno,
  saida_para_cliente = excluded.saida_para_cliente,
  redistribuicao = excluded.redistribuicao,
  atribuicao_obrigatoria = excluded.atribuicao_obrigatoria, notas = excluded.notas;

-- ---------------------------------------------------------------------
-- GEOGRAFIA
-- ---------------------------------------------------------------------
create or replace function imo_chave(txt text)
returns text language sql immutable as $$
  select trim(lower(unaccent(coalesce(txt, ''))));
$$;

-- `unaccent` pode não estar instalada; se faltar, usa-se uma normalização
-- simples. Não vale bloquear a migração inteira por causa disto.
do $$
begin
  create extension if not exists unaccent;
exception when others then
  create or replace function imo_chave(txt text)
  returns text language sql immutable as $f$
    select trim(lower(translate(coalesce(txt, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')));
  $f$;
end $$;

/* Cria uma geografia e devolve o id. Idempotente. */
create or replace function imo_geo_upsert(
  p_pai uuid, p_nivel text, p_nome text,
  p_lat numeric default null, p_lng numeric default null,
  p_manual boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from imo_geografias
   where nivel = p_nivel and nome_chave = imo_chave(p_nome)
     and (pai_id is not distinct from p_pai);
  if v_id is not null then return v_id; end if;

  insert into imo_geografias (pai_id, nivel, nome, nome_chave, lat, lng, manual)
  values (p_pai, p_nivel, p_nome, imo_chave(p_nome), p_lat, p_lng, p_manual)
  returning id into v_id;
  return v_id;
end $$;

do $$
declare
  pt uuid; lisboa uuid; setubal uuid;
  oeiras uuid; cascais uuid; lisboa_c uuid; sintra uuid; almada uuid; palmela uuid;
  uf_algés uuid; carnaxide_uf uuid;
begin
  pt := imo_geo_upsert(null, 'pais', 'Portugal');

  lisboa  := imo_geo_upsert(pt, 'distrito', 'Lisboa');
  setubal := imo_geo_upsert(pt, 'distrito', 'Setúbal');

  oeiras   := imo_geo_upsert(lisboa, 'concelho', 'Oeiras');
  cascais  := imo_geo_upsert(lisboa, 'concelho', 'Cascais');
  lisboa_c := imo_geo_upsert(lisboa, 'concelho', 'Lisboa');
  sintra   := imo_geo_upsert(lisboa, 'concelho', 'Sintra');
  almada   := imo_geo_upsert(setubal, 'concelho', 'Almada');
  palmela  := imo_geo_upsert(setubal, 'concelho', 'Palmela');

  -- Uniões de freguesias de Oeiras, onde a Terrae mais trabalha.
  uf_algés := imo_geo_upsert(oeiras, 'freguesia',
    'União das Freguesias de Algés, Linda-a-Velha e Cruz Quebrada-Dafundo');
  carnaxide_uf := imo_geo_upsert(oeiras, 'freguesia',
    'União das Freguesias de Carnaxide e Queijas');
  perform imo_geo_upsert(oeiras, 'freguesia', 'Oeiras e São Julião da Barra, Paço de Arcos e Caxias');
  perform imo_geo_upsert(oeiras, 'freguesia', 'Barcarena');
  perform imo_geo_upsert(oeiras, 'freguesia', 'Porto Salvo');

  -- MICROZONAS. Marcadas como manuais: foram desenhadas por conhecimento
  -- do mercado, não aprendidas dos dados. Quando houver observações
  -- suficientes, revê-se — e é para isso que o campo `manual` existe.
  --
  -- A razão de existirem: a média da união de Algés/Linda-a-Velha está
  -- inflacionada por Miraflores e Alto de Santa Catarina. Avaliar um
  -- apartamento no centro de Linda-a-Velha por essa média sobrevaloriza-o.
  perform imo_geo_upsert(uf_algés, 'microzona', 'Miraflores', 38.7050, -9.2280, true);
  perform imo_geo_upsert(uf_algés, 'microzona', 'Alto de Santa Catarina', 38.7010, -9.2400, true);
  perform imo_geo_upsert(uf_algés, 'microzona', 'Linda-a-Velha centro', 38.7100, -9.2400, true);
  perform imo_geo_upsert(uf_algés, 'microzona', 'Algés', 38.7000, -9.2300, true);
  perform imo_geo_upsert(uf_algés, 'microzona', 'Cruz Quebrada-Dafundo', 38.6960, -9.2470, true);

  perform imo_geo_upsert(carnaxide_uf, 'microzona', 'Carnaxide centro', 38.7220, -9.2450, true);
  perform imo_geo_upsert(carnaxide_uf, 'microzona', 'Queijas', 38.7180, -9.2560, true);
  perform imo_geo_upsert(carnaxide_uf, 'microzona', 'Outurela-Portela', 38.7280, -9.2380, true);
end $$;

-- ---------------------------------------------------------------------
-- Encontrar a geografia a partir do que o utilizador escreveu.
-- Procura da mais fina para a mais grosseira, dentro do concelho quando
-- ele é conhecido — para não colar o homónimo de outra cidade.
-- ---------------------------------------------------------------------
create or replace function imo_geo_por_nome(p_zona text, p_concelho text)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_conc uuid; v_id uuid;
begin
  if coalesce(p_concelho,'') <> '' then
    select id into v_conc from imo_geografias
     where nivel = 'concelho' and nome_chave = imo_chave(p_concelho) limit 1;
  end if;

  if coalesce(p_zona,'') <> '' then
    -- microzona dentro do concelho
    if v_conc is not null then
      select g.id into v_id
        from imo_geografias g
        join imo_geografias f on f.id = g.pai_id
       where g.nivel = 'microzona' and g.nome_chave = imo_chave(p_zona)
         and f.pai_id = v_conc
       limit 1;
      if v_id is not null then return v_id; end if;
    end if;

    -- microzona em qualquer sítio (sem concelho não há como desambiguar)
    select id into v_id from imo_geografias
     where nivel = 'microzona' and nome_chave = imo_chave(p_zona) limit 1;
    if v_id is not null then return v_id; end if;

    -- freguesia cujo nome CONTÉM a zona (as uniões trazem vários nomes)
    select id into v_id from imo_geografias
     where nivel = 'freguesia'
       and (v_conc is null or pai_id = v_conc)
       and nome_chave like '%' || imo_chave(p_zona) || '%'
     limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  return v_conc;
end $$;

-- ---------------------------------------------------------------------
-- O BENCHMARK CERTO: o mais granular COM AMOSTRA SUFICIENTE.
--
-- Uma microzona com uma transação não tem mais autoridade do que um
-- concelho com trezentas. Sobe-se na hierarquia até haver amostra que
-- justifique, e devolve-se sempre de onde veio — o relatório tem de o
-- poder dizer.
-- ---------------------------------------------------------------------
create or replace function imo_benchmark(
  p_geografia uuid, p_tipo text, p_tipologia text,
  p_min_transacoes integer default 8
) returns table (
  benchmark_id uuid, fonte_id text, geografia_id uuid, nivel text,
  nome text, eur_m2 numeric, n_transacoes integer, periodo text, desconto numeric
)
language plpgsql stable security definer set search_path = public as $$
declare v_geo uuid := p_geografia;
begin
  while v_geo is not null loop
    return query
      select b.id, b.fonte_id, b.geografia_id, g.nivel, g.nome,
             b.eur_m2_mediano, b.n_transacoes, b.periodo, b.desconto_medio
        from imo_benchmarks b
        join imo_geografias g on g.id = b.geografia_id
        join imo_fontes f on f.id = b.fonte_id
       where b.geografia_id = v_geo
         and f.escalao = 1
         and b.eur_m2_mediano is not null
         and (b.tipo_imovel is null or imo_chave(b.tipo_imovel) = imo_chave(p_tipo))
         and (b.tipologia is null or imo_chave(b.tipologia) = imo_chave(p_tipologia))
         and coalesce(b.n_transacoes, 0) >= p_min_transacoes
       -- entre iguais: mais transações primeiro, depois mais recente
       order by b.n_transacoes desc nulls last, b.periodo_fim desc nulls last
       limit 1;
    if found then return; end if;

    select pai_id into v_geo from imo_geografias where id = v_geo;
  end loop;
end $$;

revoke all on function imo_geo_upsert(uuid, text, text, numeric, numeric, boolean) from public, anon;
revoke all on function imo_benchmark(uuid, text, text, integer) from public, anon;
grant execute on function imo_geo_por_nome(text, text) to service_role;
grant execute on function imo_benchmark(uuid, text, text, integer) to service_role;

comment on function imo_benchmark(uuid, text, text, integer) is
  'Escolhe o benchmark mais granular COM amostra suficiente, subindo na '
  'hierarquia até encontrar. Devolve sempre de que nível veio — uma '
  'avaliação tem de poder dizer em que dados assenta.';
