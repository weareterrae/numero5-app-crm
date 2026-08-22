-- =====================================================================
-- 0081 — Retenção: apagar o que já passou do prazo
-- ---------------------------------------------------------------------
-- Cada assistente já declarava `retention_days` no registo. Faltava o
-- trabalho que cumpre essa declaração — e uma política escrita que ninguém
-- executa é pior do que não ter política nenhuma: dá conforto sem dar
-- proteção, e é indefensável perante uma autoridade.
--
-- O que se apaga, e porquê cada prazo:
--
--   ai_requests            pelo prazo do assistente (90 dias por omissão).
--                          Não guarda o texto das conversas, mas guarda
--                          session_id e um IP com hash — é dado pessoal.
--   ai_vigia_execucoes     30 dias. As amostras de resposta podem conter
--                          o que o modelo disse; não servem para nada
--                          depois de a avaria estar tratada.
--   ai_model_health        30 dias. É telemetria agregada, sem dados
--                          pessoais; apaga-se por higiene, não por lei.
--   ai_incidents           1 ano, e só os resolvidos. Um incidente por
--                          resolver não se apaga por decurso de tempo.
--   ai_budget_counters     duas janelas de faturação (65 dias).
--   ai_rate_limits         janelas de minutos; 2 dias é folga suficiente.
--
-- Corre todos os dias. Cada execução deixa registo do que apagou, para se
-- poder demonstrar que a política é cumprida.
-- =====================================================================

create table if not exists ai_retencao_execucoes (
  id            uuid primary key default gen_random_uuid(),
  correu_em     timestamptz not null default now(),
  duracao_ms    integer,
  apagados      jsonb not null default '{}'::jsonb,
  erro          text
);
comment on table ai_retencao_execucoes is
  'Histórico da limpeza por retenção. Existe para se poder DEMONSTRAR que a '
  'política é cumprida — não basta cumpri-la.';

alter table ai_retencao_execucoes enable row level security;
drop policy if exists ai_retencao_execucoes_staff on ai_retencao_execucoes;
create policy ai_retencao_execucoes_staff on ai_retencao_execucoes
  for select using (n5_is_staff());

-- ---------------------------------------------------------------------
-- A limpeza.
--
-- SECURITY DEFINER porque apaga em tabelas que o chamador não deve poder
-- tocar diretamente; `search_path` fixo para a definição não poder ser
-- desviada por um schema plantado à frente.
-- ---------------------------------------------------------------------
create or replace function ai_limpar_retencao()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t0        timestamptz := clock_timestamp();
  n_req     bigint := 0;
  n_vig     bigint := 0;
  n_saude   bigint := 0;
  n_inc     bigint := 0;
  n_orc     bigint := 0;
  n_rate    bigint := 0;
  resultado jsonb;
begin
  -- Pedidos: cada um pelo prazo do SEU assistente. Um assistente apagado
  -- deixa pedidos órfãos (assistant_id fica null) — esses seguem o prazo
  -- por omissão de 90 dias.
  with alvo as (
    delete from ai_requests r
    using ai_assistants a
    where r.assistant_id = a.id
      and r.created_at < now() - make_interval(days => coalesce(a.retention_days, 90))
    returning 1
  )
  select count(*) into n_req from alvo;

  with orfaos as (
    delete from ai_requests
    where assistant_id is null
      and created_at < now() - interval '90 days'
    returning 1
  )
  select count(*) + n_req into n_req from orfaos;

  with alvo as (
    delete from ai_vigia_execucoes
    where created_at < now() - interval '30 days'
    returning 1
  )
  select count(*) into n_vig from alvo;

  with alvo as (
    delete from ai_model_health
    where window_start < now() - interval '30 days'
    returning 1
  )
  select count(*) into n_saude from alvo;

  -- Só os resolvidos. Um incidente aberto há um ano é um problema por
  -- resolver, não lixo — apagá-lo esconderia exatamente o que interessa.
  with alvo as (
    delete from ai_incidents
    where resolvido_em is not null
      and created_at < now() - interval '365 days'
    returning 1
  )
  select count(*) into n_inc from alvo;

  -- Os contadores de orçamento não têm data de início, têm `period_key`
  -- ('2026-08-21' ou '2026-08') e `updated_at`. Usa-se o updated_at: um
  -- contador sem escrita há 65 dias é de uma janela fechada há muito.
  with alvo as (
    delete from ai_budget_counters
    where updated_at < now() - interval '65 days'
    returning 1
  )
  select count(*) into n_orc from alvo;

  with alvo as (
    delete from ai_rate_limits
    where window_start < now() - interval '2 days'
    returning 1
  )
  select count(*) into n_rate from alvo;

  resultado := jsonb_build_object(
    'ai_requests', n_req,
    'ai_vigia_execucoes', n_vig,
    'ai_model_health', n_saude,
    'ai_incidents', n_inc,
    'ai_budget_counters', n_orc,
    'ai_rate_limits', n_rate
  );

  insert into ai_retencao_execucoes (duracao_ms, apagados)
  values (extract(milliseconds from clock_timestamp() - t0)::int, resultado);

  return resultado;
exception when others then
  insert into ai_retencao_execucoes (duracao_ms, apagados, erro)
  values (extract(milliseconds from clock_timestamp() - t0)::int, '{}'::jsonb, sqlerrm);
  raise;
end;
$$;

revoke all on function ai_limpar_retencao() from public, anon, authenticated;
grant execute on function ai_limpar_retencao() to service_role;

comment on function ai_limpar_retencao() is
  'Apaga o que passou do prazo de retenção e deixa registo do que apagou. '
  'Corre uma vez por dia, agendada.';
