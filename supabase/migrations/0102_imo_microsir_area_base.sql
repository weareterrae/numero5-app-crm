-- =====================================================================
-- 0102 · MicroSIR: dizer sobre que ÁREA é o €/m²
-- ---------------------------------------------------------------------
-- Vai a seguir à 0101 por uma razão que só encontrei depois de a escrever,
-- ao ler o cabeçalho do `imo-importar-relatorio-sir.mjs`:
--
--   «O €/m² é sobre ÁREA BRUTA PRIVATIVA, não área útil. Comparar um €/m²
--    de área bruta com uma área útil sobrevaloriza 10-20%.»
--
-- Isso é do SIR em PDF, e o MicroSIR é o mesmo publicador e a mesma
-- família de produto — quase de certeza a mesma base de área. Mas «quase
-- de certeza» não é «verificado», e a diferença entre as duas leituras é
-- de 10 a 20% no valor final de uma casa.
--
-- Um erro desses não aparece em lado nenhum: dá um número plausível,
-- consistentemente alto, em todas as avaliações da AML. É exatamente a
-- classe de engano que não se apanha a olhar para o resultado.
--
-- Por isso a base fica ESCRITA em cada registo, com a marca de que é uma
-- suposição herdada e não uma leitura confirmada. Quem for usar estes
-- números para dividir um preço por uma área tem de poder ver isto sem
-- ter de conhecer a história.
--
-- Confirmando-se na plataforma que o MicroSIR publica área bruta
-- privativa, troca-se `area_base_confirmada` para true numa linha. Se for
-- área útil, o carregador muda e recarrega-se — os dados estão no Apify,
-- não se perde nada.
-- =====================================================================

create or replace function imo_sir_micro_carregar(p_payload jsonb)
returns table (gravadas int, sem_valores int, sem_geografia int, avisos text[])
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_geo uuid;
  v_conc uuid;
  v_nivel text;
  v_p25 numeric; v_med numeric; v_p75 numeric;
  v_n int;
  v_quando timestamptz;
  v_periodo text;
  v_meses int;
  v_gravadas int := 0;
  v_sem_val int := 0;
  v_sem_geo int := 0;
  v_avisos text[] := array[]::text[];
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

    -- Sem média não há benchmark. É o caso de Lisboa e Sintra ao nível de
    -- concelho: a API devolve a estrutura vazia para bboxes muito
    -- grandes, e isso é uma limitação da fonte, não um erro nosso.
    if v_med is null then
      v_sem_val := v_sem_val + 1;
      continue;
    end if;

    v_nivel := coalesce(r #>> '{geo,nivel}', 'freguesia');

    -- Geografia: primeiro pelo código, depois pelo nome.
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
    -- O período diz a JANELA, não o mês: estes números descrevem 24 meses
    -- que acabam na data da colheita. Escrever «2026-08» faria parecer
    -- que são de agosto.
    v_periodo := to_char(v_quando, 'YYYY-MM') || ' · ' || v_meses || 'm';

    insert into imo_benchmarks (
      fonte_id, geografia_id, tipo_imovel, tipologia, periodo, periodo_fim,
      eur_m2_mediano, eur_m2_medio, eur_m2_p25, eur_m2_p75,
      n_transacoes, dispersao, extra
    ) values (
      'sir-micro', v_geo, '', '', v_periodo, v_quando::date,
      -- Mediano fica NULO de propósito: o MicroSIR não a publica, e a
      -- média não é a mediana.
      null, v_med, v_p25, v_p75,
      v_n,
      -- Coeficiente quartílico de dispersão. Calculado, não estimado.
      case when v_p25 is not null and v_p75 is not null and (v_p75 + v_p25) > 0
           then round((v_p75 - v_p25) / (v_p75 + v_p25), 4)
           else null end,
      jsonb_build_object(
        'natureza', 'oferta',
        -- SOBRE QUE ÁREA. Dividir um preço por uma área útil usando um
        -- €/m² de área bruta sobrevaloriza 10-20%, e o resultado continua
        -- a parecer normal. Fica escrito, e fica escrito que ainda não
        -- foi confirmado na plataforma.
        'area_base', 'bruta privativa',
        'area_base_confirmada', false,
        'area_base_origem', 'herdado das notas do relatório SIR em PDF; por confirmar no MicroSIR',
        'nivel', v_nivel,
        'zona', r ->> 'zone',
        'dicofre', r #>> '{geo,dicofre}',
        'janela_meses', v_meses,
        'n_observacoes', v_n,
        -- Quanto da bbox é mesmo esta zona. Abaixo de ~0,35 o número diz
        -- mais dos vizinhos do que da zona, e quem publicar tem de saber.
        'cobertura_bbox', nullif(r #>> '{geo,cobertura}', '')::numeric,
        'avisos_colheita', coalesce(r -> 'warnings', '[]'::jsonb),
        'colhido_em', v_quando
      )
    )
    on conflict (fonte_id, geografia_id, tipo_imovel, tipologia, periodo)
    do update set
      eur_m2_medio = excluded.eur_m2_medio,
      eur_m2_p25   = excluded.eur_m2_p25,
      eur_m2_p75   = excluded.eur_m2_p75,
      n_transacoes = excluded.n_transacoes,
      dispersao    = excluded.dispersao,
      periodo_fim  = excluded.periodo_fim,
      extra        = excluded.extra;

    v_gravadas := v_gravadas + 1;
  end loop;

  return query select v_gravadas, v_sem_val, v_sem_geo, v_avisos;
end $$;

revoke all on function imo_sir_micro_carregar(jsonb) from public, anon;
grant execute on function imo_sir_micro_carregar(jsonb) to service_role;

comment on function imo_sir_micro_carregar(jsonb) is
  'Carrega o Dataset do Actor microsir em imo_benchmarks. Idempotente: '
  'correr duas vezes a mesma colheita atualiza, não duplica. Devolve '
  'quantas gravou, quantas vinham sem valores e quantas não encontraram '
  'geografia. O €/m² é assumido sobre ÁREA BRUTA PRIVATIVA — está em '
  'extra.area_base, com extra.area_base_confirmada a dizer que ainda não '
  'foi verificado na plataforma.';
