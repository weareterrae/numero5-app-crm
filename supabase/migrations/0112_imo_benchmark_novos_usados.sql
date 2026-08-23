-- =====================================================================
-- 0112 — o benchmark passa a separar CONSTRUÇÃO NOVA de USADO
-- ---------------------------------------------------------------------
-- O Micro-SIR publica os dois €/m² em separado e o carregador já os
-- guardava desde a 0106 (`extra.eur_m2_novos` / `extra.eur_m2_usados`).
-- Nunca saíam, porque a avaliação de uma casa usada não precisa deles.
--
-- Precisam os diagnósticos que comparam um imóvel CONCRETO com a zona —
-- e sem esta separação a comparação está simplesmente errada:
--
--   prémio do NOVO sobre o USADO ......... mediana 33,9%
--                                          P25 20,9% · P75 49,2%
--   prémio do NOVO sobre a MÉDIA da zona.. mediana 25,1%
--
-- A média de uma freguesia é uma mistura dominada por stock usado.
-- Medir um apartamento novo contra ela dá «25% acima do mercado» para um
-- imóvel que está EXACTAMENTE no mercado dele. Não é um ajuste fino: é a
-- diferença entre dizer a verdade e dizer o contrário dela.
--
-- Verificado em Quinta do Anjo, Palmela: média da freguesia 3.128 €/m²,
-- novos 3.638, usados 3.010. Um T3 de construção nova a 3.550 €/m² lê-se
-- como +13% contra a média e como -2% contra os novos. A segunda leitura
-- é a certa.
--
-- É a mesma família de erro que a 0104 corrigiu com a NATUREZA e a base
-- de ÁREA: comparar dois números que não são da mesma coisa e nunca
-- receber um aviso.
--
-- 730 das 733 linhas têm os dois valores, por isso isto está disponível
-- praticamente sempre — ao contrário da yield, que só existe em 228.
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
  -- NOVO na 0112. Nulo = a fonte não separa a esta granularidade; nesse
  -- caso quem consome fica pelo `eur_m2` da mistura e diz que é uma
  -- mistura, em vez de fingir que sabe.
  eur_m2_novos numeric,
  eur_m2_usados numeric
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
             nullif(b.extra ->> 'eur_m2_usados', '')::numeric
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
  'ESTADO DO MERCADO (0111) e, desde a 0112, o €/m² de CONSTRUÇÃO NOVA e '
  'de USADO em separado — porque o prémio do novo tem mediana de 33,9% e '
  'comparar um apartamento novo com a média da freguesia dá 25% de erro '
  'no sentido errado. Nulo significa «a fonte não divulga», nunca zero.';
