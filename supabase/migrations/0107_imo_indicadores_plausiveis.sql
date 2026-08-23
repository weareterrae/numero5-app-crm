-- =====================================================================
-- 0107 · Indicadores de mercado: recusar o implausível à entrada
-- ---------------------------------------------------------------------
-- A varredura das 142 zonas trouxe seis valores impossíveis. Em
-- Alcochete/São Francisco o tempo de absorção veio -0,022 meses —
-- exatamente igual ao desconto acumulado, sinal claro de que o leitor
-- apanhou o número do indicador ao lado. Na Amadora/Encosta do Sol um
-- price gap de +0,1%, quando o gap é negativo por definição.
--
-- O Actor já foi corrigido para os recusar. Mas a defesa tem de estar
-- TAMBÉM aqui, e por uma razão que não é redundância:
--
--   Um carregador não deve confiar no que lhe entregam. O Actor é uma
--   versão de software que muda; esta função é a última porta antes de
--   um número entrar numa tabela que alimenta avaliações. Se um dia
--   alguém carregar um dataset antigo, ou uma versão do Actor sem a
--   correção, é aqui que tem de parar.
--
-- Fica numa função à parte, e não escrita dentro do carregador, para que
-- afinar os limites amanhã não obrigue a reescrever cem linhas de
-- inserção — que é como se introduzem erros novos a corrigir erros
-- velhos.
--
-- Os limites vêm do glossário da plataforma e do bom senso do mercado:
--
--   price gap          negativo por definição (transação < oferta),
--                      e nunca além de -60%
--   desconto acumulado idem
--   absorção           meses INTEIROS, de 1 a 120. Um valor fracionário
--                      é o sinal mais fiável de leitura errada.
--   yield bruta        entre 0 e 25%
-- =====================================================================

create or replace function imo_indicador_plausivel(p_qual text, p_valor numeric)
returns numeric
language sql immutable as $$
  select case
    when p_valor is null then null
    when p_qual in ('price_gap', 'desconto_acumulado')
      then case when p_valor < 0 and p_valor >= -0.6 then p_valor else null end
    when p_qual = 'absorcao_meses'
      then case when p_valor >= 1 and p_valor <= 120 and p_valor = round(p_valor)
                then p_valor else null end
    when p_qual = 'yield_bruta'
      then case when p_valor > 0 and p_valor <= 0.25 then p_valor else null end
    -- Um indicador que não se conhece não se deixa passar às escondidas.
    else null
  end;
$$;

comment on function imo_indicador_plausivel(text, numeric) is
  'Devolve o valor se for plausível para aquele indicador, senão NULO. '
  'Existe porque um número implausível gravado é pior do que um campo '
  'vazio: o vazio pergunta-se, o número usa-se.';

grant execute on function imo_indicador_plausivel(text, numeric) to service_role, authenticated;

-- ---------------------------------------------------------------------
-- O carregador passa a usá-la
-- ---------------------------------------------------------------------
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
      'price_gap_aplicavel', false
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

revoke all on function imo_sir_micro_carregar(jsonb) from public, anon;
grant execute on function imo_sir_micro_carregar(jsonb) to service_role;

comment on function imo_sir_micro_carregar(jsonb) is
  'Carrega o Dataset do Actor microsir em imo_benchmarks. Idempotente. '
  'Linha geral por zona (com price gap e absorção) e uma linha por '
  'tipologia com pelo menos 30 observações. Os indicadores passam por '
  'imo_indicador_plausivel(): o que não for possível fica nulo e é '
  'contado nos avisos. natureza=transacao — o gap é sinal de mercado, '
  'NUNCA fator de conversão.';
