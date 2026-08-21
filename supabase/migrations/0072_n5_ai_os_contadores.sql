-- =====================================================================
-- N5 AI OS · contadores atómicos                                [0072]
-- ---------------------------------------------------------------------
-- Saúde, orçamentos e limites de tráfego têm de ser corretos com
-- pedidos concorrentes. Ler-somar-escrever na aplicação perde
-- incrementos sob carga — que é exatamente quando um teto de custo
-- tem de funcionar. Estas funções fazem o upsert atómico no Postgres.
--
-- SECURITY DEFINER: são chamadas pelo gateway (service role) e pelas
-- probes. Não expõem dados; só incrementam contadores.
-- Aditivo e idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Saúde: incrementa a janela do modelo e devolve a taxa de erro atual.
-- ---------------------------------------------------------------------
create or replace function ai_health_bump(
  p_model_id     uuid,
  p_window_start timestamptz,
  p_ok           boolean,
  p_status       integer default 0,
  p_latency_ms   integer default null,
  p_ttft_ms      integer default null
) returns table (requests integer, errors integer, error_rate numeric)
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  insert into ai_model_health as h (
    model_id, window_start, requests, successes, errors,
    rate_limited, server_errors, timeouts,
    last_success_at, last_failure_at, last_error_code,
    latency_p50_ms, ttft_p50_ms
  ) values (
    p_model_id, p_window_start, 1,
    case when p_ok then 1 else 0 end,
    case when p_ok then 0 else 1 end,
    case when p_status = 429 then 1 else 0 end,
    case when p_status >= 500 then 1 else 0 end,
    case when p_status = 0 then 1 else 0 end,
    case when p_ok then now() else null end,
    case when p_ok then null else now() end,
    case when p_ok then null else p_status::text end,
    p_latency_ms, p_ttft_ms
  )
  on conflict (model_id, window_start) do update set
    requests      = h.requests + 1,
    successes     = h.successes + case when p_ok then 1 else 0 end,
    errors        = h.errors + case when p_ok then 0 else 1 end,
    rate_limited  = h.rate_limited + case when p_status = 429 then 1 else 0 end,
    server_errors = h.server_errors + case when p_status >= 500 then 1 else 0 end,
    timeouts      = h.timeouts + case when p_status = 0 then 1 else 0 end,
    last_success_at = case when p_ok then now() else h.last_success_at end,
    last_failure_at = case when p_ok then h.last_failure_at else now() end,
    last_error_code = case when p_ok then h.last_error_code else p_status::text end,
    -- média móvel simples: chega para operar, sem guardar todas as amostras
    latency_p50_ms  = case when p_latency_ms is null then h.latency_p50_ms
                           else ((coalesce(h.latency_p50_ms, p_latency_ms) * 3) + p_latency_ms) / 4 end,
    ttft_p50_ms     = case when p_ttft_ms is null then h.ttft_p50_ms
                           else ((coalesce(h.ttft_p50_ms, p_ttft_ms) * 3) + p_ttft_ms) / 4 end
  returning h.requests, h.errors into r;

  return query select r.requests, r.errors,
    case when r.requests > 0 then round(r.errors::numeric / r.requests, 3) else 0 end;
end $$;

-- ---------------------------------------------------------------------
-- Orçamento: soma o custo e devolve o gasto do período.
-- É esta função que impede uma conta de sangrar por loop ou abuso.
-- ---------------------------------------------------------------------
create or replace function ai_budget_bump(
  p_budget_id  uuid,
  p_period     text,
  p_period_key text,
  p_cost       numeric
) returns numeric
language plpgsql security definer set search_path = public as $$
declare novo numeric;
begin
  insert into ai_budget_counters as c (budget_id, period, period_key, spent_usd, requests)
  values (p_budget_id, p_period, p_period_key, coalesce(p_cost, 0), 1)
  on conflict (budget_id, period, period_key) do update set
    spent_usd  = c.spent_usd + coalesce(p_cost, 0),
    requests   = c.requests + 1,
    updated_at = now()
  returning c.spent_usd into novo;
  return novo;
end $$;

-- ---------------------------------------------------------------------
-- Limite de tráfego: incrementa a janela e devolve a contagem.
-- Durável e partilhado entre instâncias — ao contrário dos Map em
-- memória que existiam até agora e reiniciavam a cada arranque a frio.
-- ---------------------------------------------------------------------
create or replace function ai_rate_bump(
  p_scope          text,
  p_scope_key      text,
  p_window_seconds integer
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  inicio timestamptz;
  n integer;
begin
  -- janela alinhada: to_timestamp(floor(epoch / w) * w)
  inicio := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into ai_rate_limits as r (scope, scope_key, window_start, window_seconds, count)
  values (p_scope, p_scope_key, inicio, p_window_seconds, 1)
  on conflict (scope, scope_key, window_seconds, window_start) do update set
    count = r.count + 1, updated_at = now()
  returning r.count into n;

  return n;
end $$;

-- ---------------------------------------------------------------------
-- Limpeza: janelas antigas não servem para nada e crescem sem fim.
-- Chamada pela função agendada das probes.
-- ---------------------------------------------------------------------
create or replace function ai_limpar_janelas(p_dias integer default 7)
returns void
language sql security definer set search_path = public as $$
  delete from ai_rate_limits where window_start < now() - (p_dias || ' days')::interval;
  delete from ai_model_health where window_start < now() - (p_dias || ' days')::interval;
  delete from ai_probes where created_at < now() - (p_dias || ' days')::interval;
$$;

-- Só o service role (gateway) e a equipa executam. Nunca o anon.
revoke all on function ai_health_bump(uuid, timestamptz, boolean, integer, integer, integer) from public, anon;
revoke all on function ai_budget_bump(uuid, text, text, numeric) from public, anon;
revoke all on function ai_rate_bump(text, text, integer) from public, anon;
revoke all on function ai_limpar_janelas(integer) from public, anon;
grant execute on function ai_health_bump(uuid, timestamptz, boolean, integer, integer, integer) to service_role;
grant execute on function ai_budget_bump(uuid, text, text, numeric) to service_role;
grant execute on function ai_rate_bump(text, text, integer) to service_role;
grant execute on function ai_limpar_janelas(integer) to service_role;

insert into schema_migrations (version) values ('0072')
on conflict (version) do nothing;
