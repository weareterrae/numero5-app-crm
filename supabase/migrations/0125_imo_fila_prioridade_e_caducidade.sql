-- =====================================================================
-- 0125 · fila do MicroSIR: os pedidos reais primeiro, e a caducidade
--        não prende o código postal
-- ---------------------------------------------------------------------
-- Dois achados da revisão da fase 1 (7 Set 2026):
--
-- 1. O pré-aquecimento (scripts/imo-cp-aquecer.mjs) mete centenas de
--    códigos postais na fila de uma vez. A fila é FIFO por tentativas e
--    created_at, 60 por corrida: um proprietário que pedisse uma
--    avaliação depois do aquecimento ficava atrás de 300 linhas e sem
--    área durante dias. Passa a haver `origem` (avaliacao | aquecimento |
--    api) e a fila serve primeiro o que veio de avaliações.
--
-- 2. Uma área «ok» caducada (90 dias) voltava a «pendente» sem repor as
--    tentativas, e imo_cp_area_gravar conta tentativas também no sucesso:
--    à terceira colheita o CP7 ficava «pendente» com tentativas = 3 para
--    sempre, fora da fila e sem servir como próprio nem como vizinho. A
--    requalificação por caducidade repõe tentativas = 0.
-- =====================================================================

alter table imo_cp_areas
  add column if not exists origem text not null default 'avaliacao'
    check (origem in ('avaliacao', 'aquecimento', 'api'));

comment on column imo_cp_areas.origem is
  'Quem pediu a área: avaliacao (o site ou a imo-api, via imo_cp_area), api (reservado) '
  'ou aquecimento (scripts/imo-cp-aquecer.mjs). A fila serve primeiro as avaliações.';

-- A fila: avaliações e API primeiro, depois o aquecimento; dentro de cada
-- grupo, menos tentativas e mais antigas primeiro.
create or replace function imo_cp_fila(p_limite integer default 40)
returns table (cp7 text, lat numeric, lng numeric)
language sql stable security definer set search_path = public as $$
  select a.cp7, a.lat, a.lng
    from imo_cp_areas a
   where a.estado in ('pendente', 'erro')
     and a.lat is not null and a.lng is not null
     and a.tentativas < 3
   order by (a.origem <> 'aquecimento') desc, a.tentativas, a.created_at
   limit greatest(1, least(coalesce(p_limite, 40), 200))
$$;

-- imo_cp_area: igual à 0124, com a caducidade a repor as tentativas.
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

  -- Caducada volta à fila COM AS TENTATIVAS REPOSTAS: tentativas mede
  -- falhas, e uma área que serviu 90 dias não falhou.
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

revoke all on function imo_cp_fila(integer) from public, anon, authenticated;
revoke all on function imo_cp_area(text, numeric, numeric, uuid) from public, anon, authenticated;
grant execute on function imo_cp_fila(integer) to service_role;
grant execute on function imo_cp_area(text, numeric, numeric, uuid) to service_role;

-- imo_cp_area_gravar: igual à 0109, mas o sucesso repõe tentativas = 0.
create or replace function imo_cp_area_gravar(p_payload jsonb)
returns table (gravadas int, sem_area int, erros int)
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_cp text;
  v_raio int; v_amostra int;
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

    if v_raio is null then
      -- Sem área utilizável. Guarda-se COMO RESULTADO: senão este ponto
      -- volta à fila todos os dias, para sempre.
      update imo_cp_areas set
        estado = 'sem_area', escada = r -> 'escada', colhido_em = now(),
        valida_ate = now() + interval '90 days',
        tentativas = tentativas + 1
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
      escada = r -> 'escada',
      colhido_em = now(),
      valida_ate = now() + interval '90 days',
      -- Sucesso REPÕE as tentativas: tentativas conta falhas. Antes contava
      -- colheitas, e à terceira o CP7 saía da fila para sempre (0125).
      tentativas = 0,
      ultimo_erro = null
     where cp7 = v_cp;
    v_ok := v_ok + 1;
  end loop;

  return query select v_ok, v_sem, v_err;
end $$;

revoke all on function imo_cp_area_gravar(jsonb) from public, anon, authenticated;
grant execute on function imo_cp_area_gravar(jsonb) to service_role;

-- As linhas que o aquecimento já pôs na fila hoje ficam marcadas como tal.
update imo_cp_areas set origem = 'aquecimento'
 where estado = 'pendente' and created_at >= '2026-09-07' and tentativas = 0
   and cp7 not in (select cp7 from imo_avaliacoes where cp7 is not null);

insert into schema_migrations (version) values ('0125')
on conflict (version) do nothing;
