-- =====================================================================
-- 0129 · o retrato competitivo: quantos imóveis semelhantes estão à venda
-- ---------------------------------------------------------------------
-- O motor sabe dizer quanto vale uma casa. Não sabe dizer contra quantas
-- outras ela vai competir, a que preço, e há quanto tempo essas estão à
-- espera de comprador. É a pergunta que o vendedor faz a seguir ao valor,
-- e a 7 de Setembro de 2026 tivemos de esvaziar esses campos do relatório
-- porque o que lá estava tinha sido inventado pelo modelo.
--
-- Isto abre o caminho para os dados entrarem. NÃO os vai buscar: a fonte
-- é um ficheiro que a Terrae exporta da sua própria subscrição, ou os
-- alertas que a plataforma lhe envia.
--
-- REAPROVEITA imo_amostras e imo_amostra_itens em vez de criar tabela
-- nova. Uma amostra já é «um conjunto de anúncios de uma zona, com
-- validade»; faltavam-lhe os campos que descrevem cada anúncio como
-- concorrente (tipologia, estado, e sobretudo há quantos dias está no
-- mercado) e a marca de onde veio.
--
-- A PORTA DA LICENÇA FICA FECHADA. A fonte entra com
-- saida_para_cliente = false: os números informam o cálculo mas não são
-- reproduzidos num documento entregue ao cliente enquanto o Infocasa não
-- confirmar por escrito que pode. A cláusula V dos termos deles proíbe
-- reproduzir conteúdo obtido na plataforma, e um relatório de avaliação
-- que os mostre é uma reprodução. Abrir esta porta é uma linha de SQL no
-- dia em que houver resposta.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. a fonte
-- ---------------------------------------------------------------------
insert into imo_fontes (id, nome, tipo, escalao, licenca, uso_interno,
                        saida_para_cliente, redistribuicao, atribuicao_obrigatoria, notas)
values
  ('infocasa', 'Infocasa · Janela Digital', 'oferta', 2, 'licenciado',
   true, false, false, null,
   'Preços PEDIDOS, agregados de portais e agências. Entram por exportação '
   'feita pela Terrae na sua própria subscrição, nunca por recolha automática: '
   'a cláusula XIII dos termos proíbe bots e scraping. saida_para_cliente '
   'fica FALSE até haver confirmação escrita de que os valores podem ser '
   'reproduzidos num relatório entregue a um proprietário.')
on conflict (id) do update set
  nome = excluded.nome, tipo = excluded.tipo, escalao = excluded.escalao,
  licenca = excluded.licenca, notas = excluded.notas;

-- ---------------------------------------------------------------------
-- 2. o que descreve um concorrente, e não apenas um comparável
-- ---------------------------------------------------------------------
alter table imo_amostra_itens
  add column if not exists tipologia    text,
  add column if not exists tipo         text,
  add column if not exists estado       text,
  add column if not exists referencia   text,
  -- O número que muda a conversa com o vendedor: um T3 a 500 000 € que
  -- está no mercado há 240 dias não é um concorrente, é um aviso.
  add column if not exists dias_mercado integer,
  add column if not exists publicado_em date;

comment on column imo_amostra_itens.dias_mercado is
  'Dias que o anúncio leva no mercado à data da colheita. Nulo quando a '
  'fonte não o diz: nulo não é zero.';

alter table imo_amostras
  add column if not exists fonte_id   text references imo_fontes(id) on delete set null,
  add column if not exists origem     text not null default 'pesquisa'
    check (origem in ('pesquisa', 'ficheiro', 'alertas')),
  add column if not exists colhida_em date;

comment on column imo_amostras.origem is
  'pesquisa = anúncios que o modelo encontrou na internet · ficheiro = '
  'exportação feita pela Terrae na subscrição da fonte · alertas = o que a '
  'plataforma envia por email. Só «pesquisa» depende de um modelo.';

create index if not exists imo_amostras_fonte on imo_amostras (fonte_id, geografia_id, valida_ate desc);

-- ---------------------------------------------------------------------
-- 3. carregar uma exportação
-- ---------------------------------------------------------------------
-- Uma amostra por (zona, tipo, tipologia, fonte, dia). Reimportar o mesmo
-- ficheiro substitui os itens em vez de os duplicar, porque duplicar
-- anúncios inflaciona a contagem de concorrentes, que é justamente o
-- número que isto existe para dar.
create or replace function imo_oferta_carregar(p_payload jsonb)
returns table (amostra uuid, itens int, ignorados int)
language plpgsql security definer set search_path = public as $$
declare
  v_geo uuid;
  v_fonte text;
  v_dia date;
  v_tipo text; v_tipologia text;
  v_chave text;
  v_amostra uuid;
  r jsonb;
  v_area numeric; v_preco numeric; v_m2 numeric;
  v_itens int := 0; v_ign int := 0;
  v_m2s numeric[] := array[]::numeric[];
begin
  v_geo := nullif(p_payload ->> 'geografia_id', '')::uuid;
  v_fonte := coalesce(nullif(p_payload ->> 'fonte_id', ''), 'infocasa');
  v_dia := coalesce(nullif(p_payload ->> 'colhida_em', '')::date, current_date);
  v_tipo := nullif(p_payload ->> 'tipo', '');
  v_tipologia := nullif(p_payload ->> 'tipologia', '');

  if v_geo is null then
    raise exception 'Falta geografia_id: uma oferta sem zona não serve para comparar com nada.';
  end if;
  if jsonb_typeof(p_payload -> 'itens') <> 'array' then
    raise exception 'Esperava itens como array; recebi %.', jsonb_typeof(p_payload -> 'itens');
  end if;

  v_chave := v_fonte || ':' || v_geo::text || ':' || coalesce(v_tipo, '') || ':'
             || coalesce(v_tipologia, '') || ':' || to_char(v_dia, 'YYYY-MM-DD');

  select a.id into v_amostra from imo_amostras a where a.chave = v_chave;
  if v_amostra is null then
    insert into imo_amostras (geografia_id, tipo, tipologia, chave, valida_ate,
                              fonte_id, origem, colhida_em)
    values (v_geo, v_tipo, v_tipologia, v_chave, v_dia + interval '45 days',
            v_fonte, coalesce(nullif(p_payload ->> 'origem', ''), 'ficheiro'), v_dia)
    returning id into v_amostra;
  else
    delete from imo_amostra_itens where amostra_id = v_amostra;
  end if;

  for r in select * from jsonb_array_elements(p_payload -> 'itens')
  loop
    v_area := nullif(r ->> 'area', '')::numeric;
    v_preco := nullif(r ->> 'preco', '')::numeric;
    -- Sem área ou sem preço não há €/m², e um concorrente sem €/m² não
    -- entra numa comparação. Conta-se como ignorado, não se adivinha.
    if v_area is null or v_area <= 0 or v_preco is null or v_preco <= 0 then
      v_ign := v_ign + 1;
      continue;
    end if;
    v_m2 := round(v_preco / v_area, 2);
    v_m2s := v_m2s || v_m2;

    insert into imo_amostra_itens (amostra_id, fonte_id, titulo, url, preco, area, eur_m2,
                                   tipologia, tipo, estado, referencia, dias_mercado,
                                   publicado_em, bruto)
    values (v_amostra, v_fonte, nullif(r ->> 'titulo', ''), nullif(r ->> 'url', ''),
            v_preco, v_area, v_m2,
            nullif(r ->> 'tipologia', ''), nullif(r ->> 'tipo', ''), nullif(r ->> 'estado', ''),
            nullif(r ->> 'referencia', ''), nullif(r ->> 'dias_mercado', '')::int,
            nullif(r ->> 'publicado_em', '')::date, r);
    v_itens := v_itens + 1;
  end loop;

  update imo_amostras a set
    n_itens = v_itens,
    eur_m2_mediano = (select percentile_cont(0.5) within group (order by x) from unnest(v_m2s) x),
    dispersao = case when v_itens >= 3 then (
      select round(((percentile_cont(0.75) within group (order by x)
                   - percentile_cont(0.25) within group (order by x))
                  / nullif(percentile_cont(0.75) within group (order by x)
                   + percentile_cont(0.25) within group (order by x), 0))::numeric, 4)
      from unnest(v_m2s) x) end
   where a.id = v_amostra;

  return query select v_amostra, v_itens, v_ign;
end $$;

-- ---------------------------------------------------------------------
-- 4. o retrato competitivo de uma zona
-- ---------------------------------------------------------------------
-- Devolve o que o vendedor quer saber, e nada mais: contra quantos
-- compete, em que faixa de preço, e há quanto tempo esses estão à espera.
create or replace function imo_oferta_zona(
  p_geografia uuid,
  p_tipologia text default null,
  p_dias integer default 60
) returns table (
  fonte_id text, colhida_em date, n_ofertas int,
  eur_m2_mediano numeric, eur_m2_min numeric, eur_m2_max numeric,
  preco_mediano numeric, dias_mercado_mediano int,
  saida_para_cliente boolean
)
language sql stable security definer set search_path = public as $$
  with a as (
    select am.id, am.fonte_id, am.colhida_em
      from imo_amostras am
     where am.geografia_id = p_geografia
       and am.origem in ('ficheiro', 'alertas')
       and am.colhida_em >= current_date - greatest(1, coalesce(p_dias, 60))
     order by am.colhida_em desc
     limit 1
  )
  select a.fonte_id, a.colhida_em, count(i.*)::int,
         percentile_cont(0.5) within group (order by i.eur_m2),
         min(i.eur_m2), max(i.eur_m2),
         percentile_cont(0.5) within group (order by i.preco),
         (percentile_cont(0.5) within group (order by i.dias_mercado))::int,
         coalesce(f.saida_para_cliente, false)
    from a
    join imo_amostra_itens i on i.amostra_id = a.id
    left join imo_fontes f on f.id = a.fonte_id
   where p_tipologia is null
      or i.tipologia is null
      or upper(replace(i.tipologia, ' ', '')) = upper(replace(p_tipologia, ' ', ''))
   group by a.fonte_id, a.colhida_em, f.saida_para_cliente
$$;

revoke all on function imo_oferta_carregar(jsonb) from public, anon, authenticated;
revoke all on function imo_oferta_zona(uuid, text, integer) from public, anon, authenticated;
grant execute on function imo_oferta_carregar(jsonb) to service_role;
grant execute on function imo_oferta_zona(uuid, text, integer) to service_role;

insert into schema_migrations (version) values ('0129')
on conflict (version) do nothing;
