-- =====================================================================
-- 0083 — Orçamento atómico: reservar antes, acertar depois
-- ---------------------------------------------------------------------
-- O fluxo era: ler o gasto → decidir → fazer o pedido → somar o custo.
-- Entre o ler e o somar há uma janela, e nessa janela cabem todos os
-- pedidos que chegarem ao mesmo tempo. Com $1 de saldo, cinquenta pedidos
-- simultâneos leem "$1 disponível", passam todos, e o teto é ultrapassado
-- cinquenta vezes.
--
-- Não é teórico: é exatamente o que acontece quando um assistente é
-- referido algures e recebe uma vaga de tráfego — que é precisamente
-- quando um teto de custo serve para alguma coisa.
--
-- O contador de tráfego (ai_rate_bump) já estava certo: faz
-- INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count,
-- um só comando atómico. O orçamento passa a seguir o mesmo princípio.
--
-- Três operações:
--
--   ai_budget_reservar(assistant, org, estimativa)
--     Soma a estimativa e devolve se ainda cabe — num só UPDATE. Quem
--     ultrapassa o teto é recusado ANTES de gastar dinheiro com o modelo.
--
--   ai_budget_acertar(assistant, org, reservado, real)
--     Depois de saber o custo verdadeiro, corrige a diferença. Devolve
--     o que sobrou ou cobra o que faltou.
--
--   ai_budget_devolver(assistant, org, reservado)
--     O pedido falhou e não custou nada: devolve a reserva inteira.
--     Sem isto, uma vaga de erros consumia o orçamento do dia sem que
--     um único token tivesse sido gerado.
--
-- A estimativa é deliberadamente GENEROSA. Reservar a mais e devolver é
-- seguro; reservar a menos deixa o buraco aberto.
-- =====================================================================

-- Qual orçamento se aplica: o do assistente tem precedência sobre o da org.
create or replace function ai_budget_aplicavel(p_assistant uuid, p_org uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from ai_budgets
  where ativo
    and (assistant_id = p_assistant or (assistant_id is null and org_id = p_org))
  order by (assistant_id = p_assistant) desc
  limit 1;
$$;

create or replace function ai_budget_reservar(
  p_assistant uuid,
  p_org       uuid,
  p_estimativa numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_budget uuid;
  v_dia    text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  v_mes    text := to_char(now() at time zone 'UTC', 'YYYY-MM');
  v_lim_dia numeric;
  v_lim_mes numeric;
  v_gasto_dia numeric;
  v_gasto_mes numeric;
begin
  v_budget := ai_budget_aplicavel(p_assistant, p_org);
  -- Sem teto definido não há nada a reservar. Devolve-se `reservado: 0`
  -- para que quem chama saiba que não tem de acertar depois.
  if v_budget is null then
    return jsonb_build_object('permitido', true, 'reservado', 0);
  end if;

  select daily_limit_usd, monthly_limit_usd into v_lim_dia, v_lim_mes
  from ai_budgets where id = v_budget;

  -- O incremento e a leitura acontecem no MESMO comando. É isto que fecha
  -- a janela: dois pedidos simultâneos nunca leem o mesmo valor.
  insert into ai_budget_counters as c (budget_id, period, period_key, spent_usd, requests)
  values (v_budget, 'day', v_dia, p_estimativa, 1)
  on conflict (budget_id, period, period_key) do update
    set spent_usd = c.spent_usd + p_estimativa,
        requests  = c.requests + 1,
        updated_at = now()
  returning c.spent_usd into v_gasto_dia;

  insert into ai_budget_counters as c (budget_id, period, period_key, spent_usd, requests)
  values (v_budget, 'month', v_mes, p_estimativa, 1)
  on conflict (budget_id, period, period_key) do update
    set spent_usd = c.spent_usd + p_estimativa,
        requests  = c.requests + 1,
        updated_at = now()
  returning c.spent_usd into v_gasto_mes;

  -- Ultrapassou? A reserva já está feita, por isso devolve-se de imediato.
  -- Assim o contador nunca fica inflacionado por um pedido que não correu.
  if (v_lim_dia is not null and v_gasto_dia > v_lim_dia)
     or (v_lim_mes is not null and v_gasto_mes > v_lim_mes) then
    update ai_budget_counters
      set spent_usd = greatest(0, spent_usd - p_estimativa),
          requests = greatest(0, requests - 1),
          updated_at = now()
    where budget_id = v_budget
      and ((period = 'day' and period_key = v_dia) or (period = 'month' and period_key = v_mes));

    return jsonb_build_object(
      'permitido', false, 'reservado', 0,
      'motivo', case when v_lim_dia is not null and v_gasto_dia > v_lim_dia then 'dia' else 'mes' end,
      'gasto_dia', v_gasto_dia - p_estimativa, 'limite_dia', v_lim_dia,
      'gasto_mes', v_gasto_mes - p_estimativa, 'limite_mes', v_lim_mes
    );
  end if;

  return jsonb_build_object(
    'permitido', true, 'reservado', p_estimativa,
    'gasto_dia', v_gasto_dia, 'limite_dia', v_lim_dia,
    'gasto_mes', v_gasto_mes, 'limite_mes', v_lim_mes
  );
end;
$$;

-- Acerto: a diferença entre o que se reservou e o que custou de verdade.
create or replace function ai_budget_acertar(
  p_assistant uuid,
  p_org       uuid,
  p_reservado numeric,
  p_real      numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_budget uuid;
  v_delta  numeric := coalesce(p_real, 0) - coalesce(p_reservado, 0);
  v_dia    text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  v_mes    text := to_char(now() at time zone 'UTC', 'YYYY-MM');
begin
  if v_delta = 0 then return; end if;
  v_budget := ai_budget_aplicavel(p_assistant, p_org);
  if v_budget is null then return; end if;

  update ai_budget_counters
    set spent_usd = greatest(0, spent_usd + v_delta), updated_at = now()
  where budget_id = v_budget
    and ((period = 'day' and period_key = v_dia) or (period = 'month' and period_key = v_mes));
end;
$$;

-- O pedido falhou e não custou nada: devolve-se a reserva inteira.
create or replace function ai_budget_devolver(
  p_assistant uuid, p_org uuid, p_reservado numeric
) returns void
language sql
security definer
set search_path = public
as $$
  select ai_budget_acertar(p_assistant, p_org, p_reservado, 0);
$$;

revoke all on function ai_budget_aplicavel(uuid, uuid) from public, anon, authenticated;
revoke all on function ai_budget_reservar(uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function ai_budget_acertar(uuid, uuid, numeric, numeric) from public, anon, authenticated;
revoke all on function ai_budget_devolver(uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function ai_budget_aplicavel(uuid, uuid) to service_role;
grant execute on function ai_budget_reservar(uuid, uuid, numeric) to service_role;
grant execute on function ai_budget_acertar(uuid, uuid, numeric, numeric) to service_role;
grant execute on function ai_budget_devolver(uuid, uuid, numeric) to service_role;

comment on function ai_budget_reservar(uuid, uuid, numeric) is
  'Reserva orçamento ANTES do pedido, num só comando atómico. Fecha a janela '
  'entre ler o gasto e somar o custo — onde cabiam todos os pedidos '
  'simultâneos com o mesmo saldo.';
