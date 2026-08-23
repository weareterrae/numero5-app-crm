-- =====================================================================
-- 0111 — o benchmark passa a dizer o ESTADO DO MERCADO da zona
-- ---------------------------------------------------------------------
-- O Micro-SIR publica quatro indicadores de mercado por zona. Três já
-- eram guardados desde a 0106/0107 e validados quanto a plausibilidade;
-- só que a função `imo_benchmark()` nunca os devolveu, e por isso
-- morriam na base de dados:
--
--   price gap          → já saía, como `desconto`
--   desconto acumulado → fica no extra (é outra coisa: negociação)
--   tempo de absorção  → coluna `tempo_absorcao_dias`, NUNCA SAÍA
--   yield bruta        → `extra->>'yield_bruta'`,       NUNCA SAÍA
--
-- Faltavam porque a avaliação de um imóvel não precisa deles: para dizer
-- quanto vale uma casa basta o €/m². Mas os diagnósticos que vêm a
-- seguir vivem exatamente destes dois:
--
--   «está há 5 meses à venda numa zona onde o tempo médio de absorção
--    é de 68 dias» — Segunda Opinião
--   «4,4% de yield bruta; a mediana desta freguesia é 5,1%» — Investidor
--
-- Sem isto, o Investidor compara com uma constante nacional cravada no
-- código (targetGrossYieldMin: 0.04), que é excelente numa freguesia e
-- má na do lado.
--
-- NOTA SOBRE O NULO: abaixo de um mínimo de observações a fonte devolve
-- NULO, não zero — é controlo de divulgação estatística. Quem consome
-- tem de tratar `null` como «não sei», nunca como «zero dias» ou
-- «yield de 0%». O contrário produz afirmações confiantes e falsas.
--
-- Em Postgres não se altera a lista de OUT params com CREATE OR REPLACE;
-- é preciso largar a função primeiro. O corpo mantém-se palavra por
-- palavra — só a assinatura cresce.
-- =====================================================================

drop function if exists imo_benchmark(uuid, text, text, integer);

create function imo_benchmark(
  p_geografia uuid, p_tipo text, p_tipologia text,
  p_min_transacoes integer default 8
) returns table (
  benchmark_id uuid, fonte_id text, geografia_id uuid, nivel text,
  nome text, eur_m2 numeric, medida text, n_transacoes integer,
  periodo text, desconto numeric, p25 numeric, p75 numeric, dispersao numeric,
  -- 'transacao' = preço a que se escriturou · 'oferta' = preço pedido.
  -- Quem converte um no outro precisa de saber em qual está.
  natureza text,
  -- 'bruta privativa' ou 'util'. Dividir um preço por uma área útil com
  -- um €/m² de área bruta sobrevaloriza 10-20%, e o resultado continua a
  -- parecer normal.
  area_base text,
  -- NOVO na 0111 — o estado do mercado, não o preço.
  -- Dias que um imóvel demora, em média, a ser absorvido nesta zona.
  absorcao_dias integer,
  -- Yield bruta anual da zona, em fração (0,051 = 5,1%).
  yield_bruta numeric,
  -- Desconto médio entre o preço pedido e a escritura, em fração.
  -- Diferente do `desconto` (price gap): este é o que se perde a
  -- negociar, aquele é o quanto a oferta está acima do fecho.
  desconto_negociacao numeric
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
             -- A natureza vem da FONTE, não de um campo solto: é lá que
             -- está declarada e é lá que se muda se um dia mudar.
             -- O registo pode contradizê-la (extra.natureza) e nesse caso
             -- ganha o registo, que é mais específico do que a fonte.
             coalesce(b.extra ->> 'natureza', f.tipo),
             b.extra ->> 'area_base',
             b.tempo_absorcao_dias,
             nullif(b.extra ->> 'yield_bruta', '')::numeric,
             nullif(b.extra ->> 'desconto_acumulado', '')::numeric
        from imo_benchmarks b
        join imo_geografias g on g.id = b.geografia_id
        join imo_fontes f on f.id = b.fonte_id
       where b.geografia_id = v_geo
         and f.escalao = 1
         and coalesce(b.eur_m2_mediano, b.eur_m2_medio) is not null
         -- Vazio = «todos»: um benchmark sem tipologia serve qualquer uma.
         and (b.tipo_imovel = '' or imo_chave(b.tipo_imovel) = imo_chave(p_tipo))
         and (b.tipologia = '' or imo_chave(b.tipologia) = imo_chave(p_tipologia))
         and coalesce(b.n_transacoes, 0) >= p_min_transacoes
       -- O mais específico primeiro: um benchmark do T3 daquela zona vale
       -- mais do que a média de todas as tipologias. Depois, mais amostra
       -- e mais recente.
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
  'hierarquia até encontrar. Aceita mediana (INE) ou média (SIR) e diz '
  'qual usou. Desde a 0104 diz a NATUREZA (transacao ou oferta) e a base '
  'de ÁREA. Desde a 0111 diz também o ESTADO DO MERCADO — absorção, '
  'yield bruta e desconto de negociação — que já era recolhido e '
  'validado mas nunca saía da base de dados. Nulo significa «a fonte não '
  'divulga», nunca zero.';
