-- =====================================================================
-- 0126 · fila do MicroSIR: falha não é «sem área»; pedido real promove a
--        origem; corrida falhada conta a tentativa a todos
-- ---------------------------------------------------------------------
-- Três achados da revisão da fase 2 (7 Set 2026):
--
-- 1. O Actor devolve escolhido = null tanto quando NÃO HÁ mercado (nenhum
--    degrau até 2 km chegou a 30 transações) como quando o ponto FALHOU
--    (502, sessão caída, timeout): nesse caso a escada vem vazia ou o
--    degrau maior vem sem amostra. imo_cp_area_gravar tratava os dois como
--    'sem_area' por 90 dias, e 'sem_area' nunca volta à fila. Uma falha
--    transitória virava resultado definitivo.
--
-- 2. imo_cp_area só escrevia origem = 'avaliacao' no INSERT. Um CP7 que o
--    aquecimento já tinha posto na fila ficava com origem 'aquecimento'
--    mesmo depois de um proprietário pedir avaliação nele: a prioridade da
--    0125 não se aplicava ao caso mais comum.
--
-- 3. Quando a corrida inteira falha em HTTP, scripts/imo-cp-fila.mjs
--    escrevia tentativas = 1 (constante) e só em linhas 'pendente': as já
--    em 'erro' nunca chegavam a 3 e a fila não avançava. Passa a haver uma
--    função que incrementa a tentativa a todas as linhas do lote.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. gravar: falha → 'erro' (tentativas + 1); sem mercado → 'sem_area'
-- ---------------------------------------------------------------------
create or replace function imo_cp_area_gravar(p_payload jsonb)
returns table (gravadas int, sem_area int, erros int)
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_cp text;
  v_raio int; v_amostra int;
  v_escada jsonb;
  v_ok int := 0; v_sem int := 0; v_err int := 0;
begin
  if jsonb_typeof(p_payload) <> 'array' then
    raise exception 'Esperava um array; recebi %.', jsonb_typeof(p_payload);
  end if;

  for r in select * from jsonb_array_elements(p_payload)
  loop
    v_cp := regexp_replace(coalesce(r ->> 'cp7', ''), '[^0-9]', '', 'g');
    if length(v_cp) <> 7 then continue; end if;
    v_cp := substring(v_cp from 1 for 4) || '-' || substring(v_cp from 5 for 3);

    v_raio := nullif(r #>> '{escolhido,raio_m}', '')::int;
    v_amostra := nullif(r #>> '{escolhido,amostra}', '')::int;
    v_escada := coalesce(r -> 'escada', '[]'::jsonb);

    if v_raio is null then
      -- Um «sem área» GENUÍNO tem o degrau maior medido (amostra numérica,
      -- 0 conta). Escada vazia, ou degrau maior sem amostra, é falha.
      if jsonb_typeof(v_escada) <> 'array'
         or jsonb_typeof(v_escada -> -1 -> 'amostra') is distinct from 'number' then
        update imo_cp_areas set
          estado = 'erro',
          escada = v_escada,
          tentativas = tentativas + 1,
          ultimo_erro = left(coalesce(r #>> '{warnings,0}', 'colheita sem medida no degrau maior'), 300)
         where cp7 = v_cp;
        v_err := v_err + 1;
        continue;
      end if;

      -- Mercado vazio: é um resultado, não uma falha.
      update imo_cp_areas set
        estado = 'sem_area', escada = v_escada, colhido_em = now(),
        valida_ate = now() + interval '90 days',
        tentativas = 0, ultimo_erro = null
       where cp7 = v_cp;
      v_sem := v_sem + 1;
      continue;
    end if;

    update imo_cp_areas set
      estado = 'ok',
      raio_m = v_raio,
      amostra = v_amostra,
      meses = nullif(r ->> 'months', '')::int,
      eur_m2_medio = nullif(r #>> '{price_m2,average}', '')::numeric,
      eur_m2_p25 = nullif(r #>> '{price_m2,p25}', '')::numeric,
      eur_m2_p75 = nullif(r #>> '{price_m2,p75}', '')::numeric,
      escada = v_escada,
      colhido_em = now(),
      valida_ate = now() + interval '90 days',
      tentativas = 0,
      ultimo_erro = null
     where cp7 = v_cp;
    v_ok := v_ok + 1;
  end loop;

  return query select v_ok, v_sem, v_err;
end $$;

-- ---------------------------------------------------------------------
-- 2. imo_cp_area: igual à 0125, com a promoção da origem
-- ---------------------------------------------------------------------
drop function if exists imo_cp_area(text, numeric, numeric, uuid);

create function imo_cp_area(
  p_cp7 text,
  p_lat numeric default null,
  p_lng numeric default null,
  p_geografia uuid default null
) returns table (
  r_cp7 text, r_estado text, r_raio_m integer, r_amostra integer,
  r_eur_m2_medio numeric, r_eur_m2_p25 numeric, r_eur_m2_p75 numeric,
  r_colhido_em timestamptz, r_escada jsonb,
  r_origem text, r_cp7_origem text, r_distancia_m integer
)
language plpgsql security definer set search_path = public as $$
declare
  v_cp text;
  v_lat numeric;
  v_lng numeric;
  v_linha imo_cp_areas%rowtype;
  v_viz record;
begin
  v_cp := regexp_replace(coalesce(p_cp7, ''), '[^0-9]', '', 'g');
  if length(v_cp) <> 7 then return; end if;
  v_cp := substring(v_cp from 1 for 4) || '-' || substring(v_cp from 5 for 3);

  v_lat := p_lat; v_lng := p_lng;
  if v_lat is null then
    select c.lat, c.lng into v_lat, v_lng from imo_codigos_postais c where c.cp7 = v_cp;
  end if;

  select * into v_linha from imo_cp_areas a where a.cp7 = v_cp;

  if v_linha.cp7 is null then
    insert into imo_cp_areas (cp7, lat, lng, geografia_id, coordenadas_em, estado, origem)
    values (v_cp, v_lat, v_lng, p_geografia,
            case when v_lat is not null then now() end, 'pendente', 'avaliacao')
    on conflict (cp7) do nothing;
  elsif v_linha.lat is null and v_lat is not null then
    update imo_cp_areas a set
      lat = v_lat, lng = v_lng,
      geografia_id = coalesce(p_geografia, a.geografia_id),
      coordenadas_em = now()
     where a.cp7 = v_cp;
  end if;

  -- Um pedido REAL promove a origem: a linha que o aquecimento tinha posto
  -- na fila passa para o grupo das avaliações. created_at fica; dentro do
  -- grupo, a mais antiga vai à frente.
  if v_linha.cp7 is not null and v_linha.origem = 'aquecimento' then
    update imo_cp_areas a set origem = 'avaliacao' where a.cp7 = v_cp;
  end if;

  -- Caducada volta à fila COM AS TENTATIVAS REPOSTAS.
  if v_linha.cp7 is not null and v_linha.estado = 'ok'
     and v_linha.valida_ate is not null and v_linha.valida_ate < now() then
    update imo_cp_areas a set estado = 'pendente', tentativas = 0, ultimo_erro = null where a.cp7 = v_cp;
    v_linha.estado := 'pendente';
  end if;

  if v_linha.cp7 is not null and v_linha.estado = 'ok' then
    return query select v_linha.cp7, v_linha.estado, v_linha.raio_m, v_linha.amostra,
                        v_linha.eur_m2_medio, v_linha.eur_m2_p25, v_linha.eur_m2_p75,
                        v_linha.colhido_em, v_linha.escada,
                        'proprio'::text, v_linha.cp7, 0;
    return;
  end if;

  if v_lat is not null and v_lng is not null then
    select a.*,
           round(6371000 * acos(least(1.0, greatest(-1.0,
             cos(radians(v_lat)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(v_lng))
             + sin(radians(v_lat)) * sin(radians(a.lat))))))::integer as dist_m
      into v_viz
      from imo_cp_areas a
     where a.estado = 'ok'
       and (a.valida_ate is null or a.valida_ate >= now())
       and a.lat between v_lat - 0.00135 and v_lat + 0.00135
       and a.lng between v_lng - 0.00173 and v_lng + 0.00173
       and a.cp7 <> v_cp
       and coalesce(a.amostra, 0) >= 30
     order by (a.lat - v_lat) ^ 2 + (a.lng - v_lng) ^ 2
     limit 1;
    if v_viz.cp7 is not null and v_viz.dist_m <= 150 then
      return query select v_cp, 'ok'::text, v_viz.raio_m, v_viz.amostra,
                          v_viz.eur_m2_medio, v_viz.eur_m2_p25, v_viz.eur_m2_p75,
                          v_viz.colhido_em, v_viz.escada,
                          'vizinho'::text, v_viz.cp7, v_viz.dist_m;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. corrida falhada em HTTP: a tentativa conta a todas as linhas do lote
-- ---------------------------------------------------------------------
create or replace function imo_cp_fila_falhou(p_cp7s text[], p_erro text)
returns integer
language sql security definer set search_path = public as $$
  with u as (
    update imo_cp_areas
       set estado = 'erro', tentativas = tentativas + 1, ultimo_erro = left(coalesce(p_erro, 'corrida falhou'), 300)
     where cp7 = any(p_cp7s) and estado in ('pendente', 'erro')
    returning 1)
  select count(*)::int from u;
$$;

revoke all on function imo_cp_area_gravar(jsonb) from public, anon, authenticated;
revoke all on function imo_cp_area(text, numeric, numeric, uuid) from public, anon, authenticated;
revoke all on function imo_cp_fila_falhou(text[], text) from public, anon, authenticated;
grant execute on function imo_cp_area_gravar(jsonb) to service_role;
grant execute on function imo_cp_area(text, numeric, numeric, uuid) to service_role;
grant execute on function imo_cp_fila_falhou(text[], text) to service_role;

-- Linhas 'sem_area' gravadas por FALHA (escada vazia ou degrau maior sem
-- amostra) voltam à fila como 'erro' com uma tentativa contada.
update imo_cp_areas set estado = 'erro', tentativas = 1, valida_ate = null,
       ultimo_erro = 'requalificado na 0126: colheita sem medida no degrau maior'
 where estado = 'sem_area'
   and (escada is null or jsonb_typeof(escada) <> 'array'
        or jsonb_typeof(escada -> -1 -> 'amostra') is distinct from 'number');

insert into schema_migrations (version) values ('0126')
on conflict (version) do nothing;
