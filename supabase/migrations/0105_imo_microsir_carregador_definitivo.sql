-- =====================================================================
-- 0105 · O carregador do MicroSIR, com a natureza certa à partida
-- ---------------------------------------------------------------------
-- É a terceira migração a tocar nesta função, e vale a pena dizer porquê
-- em vez de fingir que foi tudo de uma vez.
--
--   0101 — criou-a a escrever `natureza: oferta`. Era a suposição
--          conservadora, tomada de propósito e com a nota de que se
--          mudaria numa linha se se confirmasse o contrário.
--   0103 — confirmou-se (o glossário da plataforma diz «preços de venda
--          atualizados»). Corrigiu a FONTE e os REGISTOS já gravados.
--   0105 — corrige o CARREGADOR, que continuava a escrever «oferta».
--
-- A 0103 deixou uma bomba com temporizador: os dados ficaram certos, mas
-- a próxima colheita — dia 3 de setembro, automática — voltaria a
-- gravá-los como oferta e ninguém daria por isso. Descobriu-se porque um
-- recarregamento manual reverteu a correção à frente dos olhos.
--
-- A lição fica escrita: corrigir dados sem corrigir quem os escreve é
-- adiar o problema até ao próximo agendamento.
--
-- (A 0102 acrescentava `area_base` mas não chegou a ser aplicada — esta
-- traz essa alteração também, para não ficar nada por trás.)
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
        -- TRANSAÇÃO. É o campo de que depende tudo o resto: o ancoraSIR()
        -- só não aplica o price gap porque lê isto aqui. Escrito errado,
        -- tira 21-27% ao valor de cada imóvel, sem um erro no log.
        'natureza', 'transacao',
        'natureza_origem',
          'glossário da plataforma: «os dados apresentados no Micro-SIR '
          'reportam-se sempre a preços de venda atualizados para o presente»',
        -- Dividir um preço por uma área ÚTIL com um €/m² de área BRUTA
        -- sobrevaloriza 10-20%, e o resultado continua a parecer normal.
        'area_base', 'bruta privativa',
        'area_base_origem',
          'glossário da plataforma: define Área Bruta Privativa (fonte CIMI)',
        -- A fonte não conta «todas as vendas da freguesia»: conta as que
        -- têm centroide de código-postal dentro da bbox. Quem somar
        -- freguesias vizinhas conta transações duas vezes.
        'georreferenciacao', 'centroides de códigos-postais a 7 dígitos',
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
  'Carrega o Dataset do Actor microsir em imo_benchmarks. Idempotente. '
  'Grava natureza=transacao e area_base=bruta privativa, ambas com a '
  'origem da afirmação — é destes dois campos que depende o ancoraSIR() '
  'não descontar duas vezes um preço que já é de venda.';

-- Repor o que o recarregamento desfez, para quem não voltar a carregar.
update imo_benchmarks set
  extra = extra || jsonb_build_object(
    'natureza', 'transacao',
    'natureza_origem',
      'glossário da plataforma: «os dados apresentados no Micro-SIR '
      'reportam-se sempre a preços de venda atualizados para o presente»',
    'area_base', 'bruta privativa',
    'georreferenciacao', 'centroides de códigos-postais a 7 dígitos'
  )
where fonte_id = 'sir-micro';
