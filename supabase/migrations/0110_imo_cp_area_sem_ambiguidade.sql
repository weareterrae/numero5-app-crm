-- =====================================================================
-- 0110 · imo_cp_area(): tirar a ambiguidade dos nomes
-- ---------------------------------------------------------------------
-- A função da 0109 falhava sempre, com:
--
--   42702: column reference "cp7" is ambiguous
--   It could refer to either a PL/pgSQL variable or a table column.
--
-- Num `returns table (cp7 text, estado text, ...)`, os nomes das colunas
-- de saída passam a ser VARIÁVEIS dentro da função. Quando o corpo diz
-- `insert into imo_cp_areas (cp7, ...)` ou `set estado = ...`, o Postgres
-- não sabe se é a coluna da tabela ou a variável de retorno — e recusa,
-- que é o comportamento certo.
--
-- Prefixam-se os nomes de saída com `r_`. A alternativa seria
-- `#variable_conflict use_column`, que resolve o erro escondendo a
-- causa: passaria a haver duas coisas com o mesmo nome e uma regra
-- invisível a decidir qual ganha. Nomes diferentes não precisam de regra.
--
-- ---------------------------------------------------------------------
-- COMO ISTO PASSOU
-- ---------------------------------------------------------------------
-- O primeiro teste que escrevi lia o `data` da resposta e NÃO lia o
-- `error`. A função devolvia nada — o que era indistinguível de «não há
-- área, marquei pendente», que era exatamente o resultado esperado.
--
-- Um teste que só olha para o resultado feliz confirma o que já se
-- acreditava. Foi preciso olhar para a tabela vazia para desconfiar.
-- =====================================================================

drop function if exists imo_cp_area(text, numeric, numeric, uuid);

create or replace function imo_cp_area(
  p_cp7 text,
  p_lat numeric default null,
  p_lng numeric default null,
  p_geografia uuid default null
) returns table (
  r_cp7 text, r_estado text, r_raio_m integer, r_amostra integer,
  r_eur_m2_medio numeric, r_eur_m2_p25 numeric, r_eur_m2_p75 numeric,
  r_colhido_em timestamptz, r_escada jsonb
)
language plpgsql security definer set search_path = public as $$
declare
  v_cp text;
  v_linha imo_cp_areas%rowtype;
begin
  -- «2795229», « 2795-229 » e «2795-229» são o mesmo código postal.
  v_cp := regexp_replace(coalesce(p_cp7, ''), '[^0-9]', '', 'g');
  if length(v_cp) <> 7 then return; end if;
  v_cp := substring(v_cp from 1 for 4) || '-' || substring(v_cp from 5 for 3);

  select * into v_linha from imo_cp_areas a where a.cp7 = v_cp;

  if v_linha.cp7 is null then
    insert into imo_cp_areas (cp7, lat, lng, geografia_id, coordenadas_em, estado)
    values (v_cp, p_lat, p_lng, p_geografia,
            case when p_lat is not null then now() end, 'pendente')
    on conflict (cp7) do nothing;
    return;
  end if;

  -- Coordenadas que cheguem agora e não estivessem lá completam a linha
  -- sem esperar pela corrida.
  if v_linha.lat is null and p_lat is not null then
    update imo_cp_areas a set
      lat = p_lat, lng = p_lng,
      geografia_id = coalesce(p_geografia, a.geografia_id),
      coordenadas_em = now()
     where a.cp7 = v_cp;
  end if;

  -- Caducada volta à fila. Não se devolve: um número de há seis meses
  -- apresentado como atual é pior do que não ter número.
  if v_linha.estado = 'ok' and v_linha.valida_ate is not null and v_linha.valida_ate < now() then
    update imo_cp_areas a set estado = 'pendente' where a.cp7 = v_cp;
    return;
  end if;

  if v_linha.estado <> 'ok' then return; end if;

  return query select v_linha.cp7, v_linha.estado, v_linha.raio_m, v_linha.amostra,
                      v_linha.eur_m2_medio, v_linha.eur_m2_p25, v_linha.eur_m2_p75,
                      v_linha.colhido_em, v_linha.escada;
end $$;

revoke all on function imo_cp_area(text, numeric, numeric, uuid) from public, anon;
grant execute on function imo_cp_area(text, numeric, numeric, uuid) to service_role;

comment on function imo_cp_area(text, numeric, numeric, uuid) is
  'A área de mercado deste código postal, se estiver boa. Se não estiver, '
  'mete-o na fila e devolve nada — quem chama serve a freguesia e segue. '
  'As colunas de saída levam prefixo r_ porque num returns table os nomes '
  'de saída viram variáveis e colidem com as colunas da tabela.';
