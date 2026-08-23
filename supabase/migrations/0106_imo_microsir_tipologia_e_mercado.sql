-- =====================================================================
-- 0106 · O MicroSIR passa a entrar por tipologia e com mercado
-- ---------------------------------------------------------------------
-- A V2 do Actor colhe, por zona, três coisas que o carregador ignorava:
--
--   by_typology   €/m² por Apt. ≤T1 · T2 · T3 · ≥T4 · Mor. ≤T3 · ≥T4
--   by_condition  novos contra usados
--   market        price gap · absorção · desconto acumulado · yield
--
-- ---------------------------------------------------------------------
-- A TIPOLOGIA GANHA LINHA PRÓPRIA — era para isto que a chave existia
-- ---------------------------------------------------------------------
-- `imo_benchmarks` tem `unique (fonte_id, geografia_id, tipo_imovel,
-- tipologia, periodo)` e o `imo_benchmark()` ordena os específicos à
-- frente dos gerais. Estava construído para isto e nunca tinha sido
-- usado com dados automáticos.
--
-- O que muda: um T3 em Carnaxide deixa de ser avaliado pela média de
-- todas as tipologias da freguesia e passa a ter o número dos T3. Na
-- amostra de validação, os T3 estavam 11% abaixo dos T2 — porque os T2
-- ali são apartamentos novos junto ao mar e os T3 são prédios antigos.
-- Nenhum fator de ajuste teria adivinhado isso; os dados sabem-no.
--
-- ---------------------------------------------------------------------
-- O PISO DE 30, E PORQUE É AQUI QUE SE DECIDE
-- ---------------------------------------------------------------------
-- Uma tipologia com 5 observações não é um benchmark, é ruído. E o
-- `imo_benchmark()` prefere o específico ao geral — logo um T4 com 10
-- transações ganharia a uma zona com 1.285, que é exatamente a inversão
-- que o comentário da tabela avisa para não deixar acontecer.
--
-- Podia mexer-se no limiar da função, mas isso mudaria o comportamento
-- de todas as fontes. A decisão pertence a quem grava: linhas de
-- tipologia abaixo de 30 observações NÃO SE ESCREVEM, e a linha geral da
-- zona serve. Menos preciso, mas verdadeiro.
--
-- ---------------------------------------------------------------------
-- O MERCADO VAI NA LINHA GERAL
-- ---------------------------------------------------------------------
-- `desconto_medio` leva o PRICE GAP, e `tempo_absorcao_dias` a absorção.
-- Ambas as colunas já existiam e o SIR em PDF já as usava assim.
--
-- ATENÇÃO ao que o gap NÃO é: estes €/m² são de TRANSAÇÃO, por isso o gap
-- vai como sinal de mercado, não como fator de conversão. O `ancoraSIR()`
-- do site já sabe distinguir desde a 0104 — lê `natureza` e não
-- multiplica. Quem escrever código novo contra estes dados tem de o saber
-- também, e é por isso que fica escrito aqui.
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
  v_tipo text; v_tipologia text; v_valor numeric; v_conta int;
  v_gravadas int := 0;
  v_sem_val int := 0;
  v_sem_geo int := 0;
  v_avisos text[] := array[]::text[];
  -- Abaixo disto, uma tipologia é ruído com ar de facto.
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

    -- Novos e usados vão no extra da linha geral, como o SIR em PDF já
    -- fazia: a chave de unicidade não tem dimensão para «estado», e
    -- inventar-lhe uma partia a compatibilidade com o que lá está.
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
      'desconto_acumulado', nullif(r #>> '{market,desconto_acumulado}', '')::numeric,
      'yield_bruta', nullif(r #>> '{market,yield_bruta}', '')::numeric,
      -- O gap está aqui como SINAL DE MERCADO. Estes €/m² já são de
      -- transação: multiplicá-los por ele desconta-os segunda vez.
      'price_gap_aplicavel', false
    );

    -- ---- linha geral da zona
    insert into imo_benchmarks (
      fonte_id, geografia_id, tipo_imovel, tipologia, periodo, periodo_fim,
      eur_m2_mediano, eur_m2_medio, eur_m2_p25, eur_m2_p75,
      n_transacoes, dispersao, desconto_medio, tempo_absorcao_dias, extra
    ) values (
      'sir-micro', v_geo, '', '', v_periodo, v_quando::date,
      null, v_med, v_p25, v_p75, v_n,
      case when v_p25 is not null and v_p75 is not null and (v_p75 + v_p25) > 0
           then round((v_p75 - v_p25) / (v_p75 + v_p25), 4) else null end,
      nullif(r #>> '{market,price_gap}', '')::numeric,
      round(nullif(r #>> '{market,absorcao_meses}', '')::numeric * 30)::int,
      v_extra
    )
    on conflict (fonte_id, geografia_id, tipo_imovel, tipologia, periodo)
    do update set
      eur_m2_medio = excluded.eur_m2_medio, eur_m2_p25 = excluded.eur_m2_p25,
      eur_m2_p75 = excluded.eur_m2_p75, n_transacoes = excluded.n_transacoes,
      dispersao = excluded.dispersao, desconto_medio = excluded.desconto_medio,
      tempo_absorcao_dias = excluded.tempo_absorcao_dias,
      periodo_fim = excluded.periodo_fim, extra = excluded.extra;

    v_gravadas := v_gravadas + 1;

    -- ---- uma linha por tipologia, quando a amostra a sustenta
    for cat in select * from jsonb_array_elements(coalesce(r -> 'by_typology', '[]'::jsonb))
    loop
      v_valor := nullif(cat ->> 'value', '')::numeric;
      v_conta := nullif(cat ->> 'count', '')::int;
      if v_valor is null or coalesce(v_conta, 0) < PISO_TIPOLOGIA then continue; end if;

      -- «Apt. ≤ T1» → apartamento/T1 · «Mor. ≥ T4» → moradia/T4.
      -- Os sinais ≤ e ≥ perdem-se de propósito: o motor pergunta por «T3»,
      -- não por «≤T3», e uma tipologia que ele nunca pede é uma linha que
      -- nunca ninguém lê.
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
        null, v_valor, v_conta,
        nullif(r #>> '{market,price_gap}', '')::numeric,
        round(nullif(r #>> '{market,absorcao_meses}', '')::numeric * 30)::int,
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

  return query select v_gravadas, v_sem_val, v_sem_geo, v_avisos;
end $$;

revoke all on function imo_sir_micro_carregar(jsonb) from public, anon;
grant execute on function imo_sir_micro_carregar(jsonb) to service_role;

comment on function imo_sir_micro_carregar(jsonb) is
  'Carrega o Dataset do Actor microsir em imo_benchmarks. Idempotente. '
  'Escreve a linha geral da zona (com price gap e absorção) e uma linha '
  'por tipologia com pelo menos 30 observações — abaixo disso é ruído, e '
  'o imo_benchmark() prefere o específico ao geral. natureza=transacao: '
  'o price gap vai como sinal de mercado, NUNCA como fator de conversão.';
