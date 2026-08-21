-- =====================================================================
-- N5 AI OS · vistas para o painel de operações               [0075]
-- ---------------------------------------------------------------------
-- O dashboard tem de responder depressa sem varrer o ledger inteiro.
-- Vistas agregadas, só leitura, com o mesmo isolamento de sempre.
--
-- security_invoker: a vista corre com as permissões de QUEM consulta,
-- não do dono. Sem isto, uma vista contornava o RLS das tabelas por
-- baixo — seria um buraco de isolamento entre clientes.
-- =====================================================================

-- Resumo de hoje e do mês, por assistente.
create or replace view ai_resumo_assistente
with (security_invoker = true) as
select
  a.id                        as assistant_id,
  a.org_id,
  a.nome,
  a.marca,
  a.ativo,
  a.gateway_enabled,
  a.traffic_percentage,
  count(r.id) filter (where r.created_at >= date_trunc('day', now()))            as pedidos_hoje,
  count(r.id) filter (where r.created_at >= date_trunc('month', now()))          as pedidos_mes,
  count(r.id) filter (where r.created_at >= date_trunc('day', now()) and r.status = 'ok')     as ok_hoje,
  count(r.id) filter (where r.created_at >= date_trunc('day', now()) and r.status <> 'ok')    as erros_hoje,
  count(r.id) filter (where r.created_at >= date_trunc('day', now()) and r.fallback_used)     as fallbacks_hoje,
  coalesce(sum(r.estimated_cost) filter (where r.created_at >= date_trunc('day', now())), 0)  as custo_hoje,
  coalesce(sum(r.estimated_cost) filter (where r.created_at >= date_trunc('month', now())), 0) as custo_mes,
  percentile_disc(0.5) within group (order by r.ttft_ms)
    filter (where r.created_at >= date_trunc('day', now()) and r.ttft_ms is not null)         as ttft_p50,
  percentile_disc(0.95) within group (order by r.ttft_ms)
    filter (where r.created_at >= date_trunc('day', now()) and r.ttft_ms is not null)         as ttft_p95
from ai_assistants a
left join ai_requests r on r.assistant_id = a.id
group by a.id, a.org_id, a.nome, a.marca, a.ativo, a.gateway_enabled, a.traffic_percentage;

-- Tráfego e desempenho por modelo, últimas 24h.
create or replace view ai_resumo_modelo
with (security_invoker = true) as
select
  m.id            as model_id,
  m.provider_id,
  m.provider_model_id,
  m.display_name,
  m.status,
  m.enabled,
  m.health_status,
  m.circuit_state,
  m.last_health_check,
  m.deprecation_date,
  m.shutdown_date,
  count(r.id)                                              as pedidos_24h,
  count(r.id) filter (where r.status = 'ok')               as ok_24h,
  count(r.id) filter (where r.status <> 'ok')              as erros_24h,
  coalesce(sum(r.estimated_cost), 0)                       as custo_24h,
  percentile_disc(0.5)  within group (order by r.ttft_ms)  as ttft_p50,
  percentile_disc(0.95) within group (order by r.ttft_ms)  as ttft_p95
from ai_models m
left join ai_requests r
  on r.model_id = m.id and r.created_at >= now() - interval '24 hours'
group by m.id;

-- Saúde por fornecedor, a partir das probes recentes.
create or replace view ai_resumo_fornecedor
with (security_invoker = true) as
select
  p.id            as provider_id,
  p.display_name,
  p.enabled,
  count(distinct m.id) filter (where m.enabled)                       as modelos_ativos,
  count(distinct m.id) filter (where m.health_status = 'HEALTHY')     as modelos_saudaveis,
  count(distinct m.id) filter (where m.circuit_state = 'OPEN')        as circuitos_abertos,
  max(m.last_health_check)                                            as ultima_verificacao
from ai_providers p
left join ai_models m on m.provider_id = p.id
group by p.id, p.display_name, p.enabled;

comment on view ai_resumo_assistente is 'Painel AI Operations: pedidos, erros, custo e TTFT por assistente.';
comment on view ai_resumo_modelo      is 'Painel AI Operations: tráfego e latência por modelo, 24h.';
comment on view ai_resumo_fornecedor  is 'Painel AI Operations: saúde agregada por fornecedor.';

insert into schema_migrations (version) values ('0075')
on conflict (version) do nothing;
