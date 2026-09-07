-- =====================================================================
-- 0128 · a colheita mensal deixa de abrir as páginas de relatório
-- ---------------------------------------------------------------------
-- A 7 de Setembro de 2026 a Confidencial Imobiliário identificou a nossa
-- recolha como «extração de relatórios maciça e automatizada». Tinha
-- razão no que viu: 142 páginas de relatório por mês, uma por zona.
--
-- Fomos medir o que essas páginas nos davam. Entre a colheita de Agosto
-- e a de Setembro, sobre as 728 linhas comparáveis:
--
--   €/m² da zona ........ mediana 2,86% de variação   (justifica o mês)
--   price gap ........... mediana 0,00 pontos          (não justifica)
--   tempo de absorção ... mediana 0 dias               (não justifica)
--
-- Logo: os percentis ficam mensais e os indicadores passam a trimestrais.
-- A corrida mensal cai de treze minutos para três e deixa de tocar numa
-- única página de relatório.
--
-- Esta migração é o que impede essa poupança de estragar o site: sem ela,
-- o mês seguinte gravava indicadores nulos e o cliente deixava de ver o
-- tempo de venda e o desconto da zona. Passam a herdar-se os últimos
-- medidos, com `extra.indicadores_de` a dizer de que colheita vieram.
-- =====================================================================

create or replace function imo_sir_micro_carregar(p_payload jsonb)
returns table (gravadas int, sem_valores int, sem_geografia int, avisos text[])
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  cat jsonb;
  v_geo uuid;
  v_conc uuid;
  v_nivel text;
  v_p25 numeric; v_med numeric; v_p75 numeric;
  v_n int;
  v_quando timestamptz;
  v_periodo text;
  v_meses int;
  v_extra jsonb;
  v_novos numeric; v_usados numeric;
  v_gap numeric; v_absorcao numeric; v_desconto numeric; v_yield numeric;
  v_absorcao_dias int;
  v_herdado record;
  v_indicadores_de text;
  v_tipo text; v_tipologia text; v_valor numeric; v_conta int;
  v_gravadas int := 0;
  v_sem_val int := 0;
  v_sem_geo int := 0;
  v_recusados int := 0;
  v_avisos text[] := array[]::text[];
  PISO_TIPOLOGIA constant int := 30;
begin
  if jsonb_typeof(p_payload) <> 'array' then
    raise exception 'Esperava um array de registos; recebi %.', jsonb_typeof(p_payload);
  end if;

  for r in select * from jsonb_array_elements(p_payload)
  loop
    v_p25 := nullif(r #>> '{price_m2,p25}', '')::numeric;
    v_med := nullif(r #>> '{price_m2,average}', '')::numeric;
    v_p75 := nullif(r #>> '{price_m2,p75}', '')::numeric;
    v_n   := nullif(r ->> 'sample_count', '')::int;

    if v_med is null then
      v_sem_val := v_sem_val + 1;
      continue;
    end if;

    v_nivel := coalesce(r #>> '{geo,nivel}', 'freguesia');

    v_geo := null;
    if coalesce(r #>> '{geo,dicofre}', '') <> '' then
      select id into v_geo from imo_geografias
       where nivel = v_nivel and codigo_ine = r #>> '{geo,dicofre}' limit 1;
    end if;

    if v_geo is null then
      select id into v_conc from imo_geografias
       where nivel = 'concelho' and nome_chave = imo_chave(r #>> '{geo,concelho}') limit 1;
      if v_nivel = 'concelho' then
        v_geo := v_conc;
      elsif v_conc is not null then
        select id into v_geo from imo_geografias
         where nivel = 'freguesia' and pai_id = v_conc
           and nome_chave = imo_chave(r #>> '{geo,freguesia}') limit 1;
      end if;
    end if;

    if v_geo is null then
      v_sem_geo := v_sem_geo + 1;
      v_avisos := v_avisos || format('Sem geografia para "%s".', r ->> 'zone');
      continue;
    end if;

    v_quando := coalesce((r ->> 'collected_at')::timestamptz, now());
    v_meses := coalesce(nullif(r ->> 'months', '')::int, 24);
    v_periodo := to_char(v_quando, 'YYYY-MM') || ' · ' || v_meses || 'm';

    -- ---- os indicadores, passados pela porta
    v_gap := imo_indicador_plausivel('price_gap', nullif(r #>> '{market,price_gap}', '')::numeric);
    v_absorcao := imo_indicador_plausivel('absorcao_meses', nullif(r #>> '{market,absorcao_meses}', '')::numeric);
    v_desconto := imo_indicador_plausivel('desconto_acumulado', nullif(r #>> '{market,desconto_acumulado}', '')::numeric);
    v_yield := imo_indicador_plausivel('yield_bruta', nullif(r #>> '{market,yield_bruta}', '')::numeric);

    -- Contar o que se recusou. Uma recusa silenciosa é um dado perdido
    -- que ninguém procura.
    if (r #>> '{market,price_gap}') is not null and v_gap is null then
      v_recusados := v_recusados + 1;
      v_avisos := v_avisos || format('Price gap implausível em "%s": %s.', r ->> 'zone', r #>> '{market,price_gap}');
    end if;
    if (r #>> '{market,absorcao_meses}') is not null and v_absorcao is null then
      v_recusados := v_recusados + 1;
      v_avisos := v_avisos || format('Absorção implausível em "%s": %s.', r ->> 'zone', r #>> '{market,absorcao_meses}');
    end if;

    -- ---- INDICADORES HERDADOS DA ÚLTIMA COLHEITA TRIMESTRAL
    --
    -- A colheita mensal deixou de abrir as páginas de relatório. Medido
    -- entre Agosto e Setembro de 2026 sobre 728 linhas: o price gap mexeu
    -- 0,00 pontos e a absorção 0 dias de um mês para o outro. Eram 142
    -- páginas por mês para não mudar nada, e era isso que o fornecedor
    -- via como extração maciça. Passaram a trimestrais.
    --
    -- Nos meses intermédios o payload vem sem bloco market e os quatro
    -- indicadores ficariam nulos, o que apagava do site o tempo de venda
    -- e o desconto da zona. Herdam-se os últimos conhecidos, e fica
    -- escrito de que período são, para ninguém os tomar por medidos hoje.
    -- Um record nao se limpa por atribuicao: quem marca a heranca e esta.
    v_indicadores_de := null;
    if v_gap is null and v_absorcao is null and v_desconto is null and v_yield is null then
      select b.desconto_medio as gap, b.tempo_absorcao_dias as dias, b.periodo,
             (b.extra ->> 'desconto_acumulado')::numeric as desc_acum,
             (b.extra ->> 'yield_bruta')::numeric as yield_b
        into v_herdado
        from imo_benchmarks b
       where b.fonte_id = 'sir-micro' and b.geografia_id = v_geo
         and b.tipo_imovel = '' and b.tipologia = ''
         and (b.desconto_medio is not null or b.tempo_absorcao_dias is not null)
       order by b.periodo_fim desc nulls last
       limit 1;
      if v_herdado.periodo is not null then
        v_gap := v_herdado.gap;
        v_desconto := v_herdado.desc_acum;
        v_yield := v_herdado.yield_b;
        v_absorcao := case when v_herdado.dias is not null then v_herdado.dias / 30.0 end;
        v_indicadores_de := v_herdado.periodo;
      end if;
    end if;

    v_absorcao_dias := round(v_absorcao * 30)::int;

    v_novos := null; v_usados := null;
    for cat in select * from jsonb_array_elements(coalesce(r -> 'by_condition', '[]'::jsonb))
    loop
      if imo_chave(cat ->> 'nome') like 'novo%' then v_novos := nullif(cat ->> 'value', '')::numeric; end if;
      if imo_chave(cat ->> 'nome') like 'usado%' then v_usados := nullif(cat ->> 'value', '')::numeric; end if;
    end loop;

    v_extra := jsonb_build_object(
      'natureza', 'transacao',
      'natureza_origem',
        'glossário da plataforma: «os dados apresentados no Micro-SIR '
        'reportam-se sempre a preços de venda atualizados para o presente»',
      'area_base', 'bruta privativa',
      'georreferenciacao', 'centroides de códigos-postais a 7 dígitos',
      'nivel', v_nivel,
      'zona', r ->> 'zone',
      'dicofre', r #>> '{geo,dicofre}',
      'janela_meses', v_meses,
      'n_observacoes', v_n,
      'cobertura_bbox', nullif(r #>> '{geo,cobertura}', '')::numeric,
      'avisos_colheita', coalesce(r -> 'warnings', '[]'::jsonb),
      'colhido_em', v_quando,
      'eur_m2_novos', v_novos,
      'eur_m2_usados', v_usados,
      'desconto_acumulado', v_desconto,
      'yield_bruta', v_yield,
      -- Estes €/m² já são de transação: multiplicá-los pelo gap
      -- desconta-os segunda vez.
      'price_gap_aplicavel', false,
      -- De que colheita vieram os quatro indicadores de mercado.
      -- Nulo quando foram medidos nesta.
      'indicadores_de', v_indicadores_de
    );

    insert into imo_benchmarks (
      fonte_id, geografia_id, tipo_imovel, tipologia, periodo, periodo_fim,
      eur_m2_mediano, eur_m2_medio, eur_m2_p25, eur_m2_p75,
      n_transacoes, dispersao, desconto_medio, tempo_absorcao_dias, extra
    ) values (
      'sir-micro', v_geo, '', '', v_periodo, v_quando::date,
      null, v_med, v_p25, v_p75, v_n,
      case when v_p25 is not null and v_p75 is not null and (v_p75 + v_p25) > 0
           then round((v_p75 - v_p25) / (v_p75 + v_p25), 4) else null end,
      v_gap, v_absorcao_dias, v_extra
    )
    on conflict (fonte_id, geografia_id, tipo_imovel, tipologia, periodo)
    do update set
      eur_m2_medio = excluded.eur_m2_medio, eur_m2_p25 = excluded.eur_m2_p25,
      eur_m2_p75 = excluded.eur_m2_p75, n_transacoes = excluded.n_transacoes,
      dispersao = excluded.dispersao, desconto_medio = excluded.desconto_medio,
      tempo_absorcao_dias = excluded.tempo_absorcao_dias,
      periodo_fim = excluded.periodo_fim, extra = excluded.extra;

    v_gravadas := v_gravadas + 1;

    for cat in select * from jsonb_array_elements(coalesce(r -> 'by_typology', '[]'::jsonb))
    loop
      v_valor := nullif(cat ->> 'value', '')::numeric;
      v_conta := nullif(cat ->> 'count', '')::int;
      if v_valor is null or coalesce(v_conta, 0) < PISO_TIPOLOGIA then continue; end if;

      v_tipo := case
        when imo_chave(cat ->> 'nome') like 'apt%' then 'apartamento'
        when imo_chave(cat ->> 'nome') like 'mor%' then 'moradia'
        else null end;
      v_tipologia := substring(upper(cat ->> 'nome') from 'T\s?([0-9])');
      if v_tipo is null or v_tipologia is null then
        v_avisos := v_avisos || format('Tipologia não reconhecida: "%s" em %s.', cat ->> 'nome', r ->> 'zone');
        continue;
      end if;
      v_tipologia := 'T' || v_tipologia;

      insert into imo_benchmarks (
        fonte_id, geografia_id, tipo_imovel, tipologia, periodo, periodo_fim,
        eur_m2_mediano, eur_m2_medio, n_transacoes, desconto_medio,
        tempo_absorcao_dias, extra
      ) values (
        'sir-micro', v_geo, v_tipo, v_tipologia, v_periodo, v_quando::date,
        null, v_valor, v_conta, v_gap, v_absorcao_dias,
        v_extra || jsonb_build_object('categoria_origem', cat ->> 'nome')
      )
      on conflict (fonte_id, geografia_id, tipo_imovel, tipologia, periodo)
      do update set
        eur_m2_medio = excluded.eur_m2_medio, n_transacoes = excluded.n_transacoes,
        desconto_medio = excluded.desconto_medio,
        tempo_absorcao_dias = excluded.tempo_absorcao_dias,
        periodo_fim = excluded.periodo_fim, extra = excluded.extra;

      v_gravadas := v_gravadas + 1;
    end loop;
  end loop;

  if v_recusados > 0 then
    v_avisos := array_prepend(
      format('%s indicadores recusados por implausibilidade (ficaram nulos).', v_recusados), v_avisos);
  end if;

  return query select v_gravadas, v_sem_val, v_sem_geo, v_avisos;
end $$;

comment on function imo_sir_micro_carregar(jsonb) is
  'Carrega o Dataset do Actor microsir em imo_benchmarks. Idempotente. '
  'Linha geral por zona e uma linha por tipologia com pelo menos 30 '
  'observações. Quando a colheita vem sem indicadores de mercado (corrida '
  'mensal, só percentis), herda os últimos medidos e regista a origem em '
  'extra.indicadores_de. natureza=transacao, o gap é sinal de mercado e '
  'NUNCA fator de conversão.';

insert into schema_migrations (version) values ('0128')
on conflict (version) do nothing;
