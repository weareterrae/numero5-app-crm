-- =====================================================================
-- 0113 — o benchmark passa a dizer QUE LINHA escolheu
-- ---------------------------------------------------------------------
-- A `imo_benchmark()` procura a linha mais específica que existe e, se
-- não houver, sobe: T5 → todas as tipologias → concelho. É a regra certa
-- e não muda aqui. O problema é que ela nunca disse qual encontrou, e
-- quem consome não tem como distinguir uma referência específica de um
-- recurso.
--
-- O CASO QUE ISTO DESTAPOU
--
-- Moradia T5 de 500 m² no Alto de Santa Catarina, anunciada a 2.980.000 €.
-- O diagnóstico do comprador respondeu «8,7% abaixo do mercado», com
-- toda a confiança. Só que:
--
--   Apartamento T2 na mesma freguesia → linha própria, N=786
--   Moradia T5 na mesma freguesia     → NÃO EXISTE; caiu na linha de
--                                        todas as tipologias, N=9.910,
--                                        dominada por apartamentos
--
-- Comparou-se uma moradia de 500 m² sobre o Tejo com um conjunto que é,
-- na esmagadora maioria, apartamentos de 80 a 120 m². E em silêncio.
--
-- Não é o mesmo erro da natureza (0104) nem do novo vs usado (0112),
-- mas é da mesma família: comparar dois números que não são da mesma
-- coisa sem que ninguém receba um aviso. A diferença é que aqui a
-- própria função sabia — só não dizia.
--
-- Com estes dois campos, quem consome pode:
--   · declarar no relatório que a referência é genérica;
--   · recusar-se a dar veredicto quando o imóvel está longe do conjunto
--     que a linha descreve — que é o caso do segmento de luxo, onde o
--     erro é grande em euros e o cliente é o mais exigente.
--
-- Vazio ('') quer dizer «esta linha vale para todos». Não é nulo: nulo
-- seria «não sei», e aqui sabe-se.
-- =====================================================================

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
  -- NOVO na 0113 — a linha que foi de facto escolhida.
  -- '' = «vale para todas as tipologias / todos os tipos», ou seja, a
  -- procura subiu porque não havia nada mais específico.
  tipologia_benchmark text,
  tipo_benchmark text
)
language plpgsql stable security definer set search_path = public as $$
declare v_geo uuid := p_geografia;
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
         and (b.tipologia = '' or imo_chave(b.tipologia) = imo_chave(p_tipologia))
         and coalesce(b.n_transacoes, 0) >= p_min_transacoes
       order by (b.tipologia <> '')::int desc,
                (b.tipo_imovel <> '')::int desc,
                b.n_transacoes desc nulls last,
                b.periodo_fim desc nulls last
       limit 1;
    if found then return; end if;

    select pai_id into v_geo from imo_geografias where id = v_geo;
  end loop;
end $$;

revoke all on function imo_benchmark(uuid, text, text, integer) from public, anon;
grant execute on function imo_benchmark(uuid, text, text, integer) to service_role;

comment on function imo_benchmark(uuid, text, text, integer) is
  'Escolhe o benchmark mais granular COM amostra suficiente, subindo na '
  'hierarquia até encontrar. Diz a NATUREZA e a base de ÁREA (0104), o '
  'ESTADO DO MERCADO (0111), o €/m² de NOVO e de USADO (0112) e, desde a '
  '0113, QUE LINHA escolheu — tipologia e tipo, vazios quando a procura '
  'subiu por não haver nada mais específico. Sem isso, uma moradia T5 é '
  'comparada com uma freguesia de apartamentos sem que ninguém saiba.';
