-- =====================================================================
-- N5 AI OS · control plane                                      [0071]
-- ---------------------------------------------------------------------
-- Camada própria do Nº 5 entre os sites/apps e os fornecedores de
-- modelos. Os fornecedores são compute; o control plane é nosso.
--
-- 100% ADITIVO: não altera nem apaga nada do que já existe. Nenhuma
-- tabela anterior é tocada. Segue as convenções de 0046/0067:
--   · equipa do Nº 5 (n5_is_staff())        → vê tudo
--   · utilizador de cliente (n5_org_ids())  → só a(s) sua(s) org(s)
--   · tabelas de segredos/operação          → só equipa
--
-- Contexto (21 ago 2026): criado depois de um incidente em que IDs de
-- modelo escritos à mão em 9 repositórios deixaram assistentes em baixo
-- quando a Google desligou o gemini-2.0-flash. Nunca mais.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROVIDERS — quem executa a inferência (compute)
-- ---------------------------------------------------------------------
create table if not exists ai_providers (
  id            text primary key,                    -- 'openai' | 'google' | 'anthropic' | 'bedrock'
  display_name  text not null,
  -- Endpoint base. Permite apontar o MESMO adaptador para sítios
  -- diferentes: o Bedrock expõe superfície compatível com a OpenAI, por
  -- isso 'bedrock' usa o adaptador openai com outro base_url/credencial.
  adapter       text not null,                       -- 'openai' | 'google' | 'anthropic'
  base_url      text,
  -- Nome da variável de ambiente que guarda a chave. NUNCA a chave.
  api_key_env   text not null,
  enabled       boolean not null default true,
  -- Configuração livre do adaptador (região, versão de API, headers…).
  config        jsonb not null default '{}'::jsonb,
  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists ai_providers_updated on ai_providers;
create trigger ai_providers_updated before update on ai_providers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 2. MODELS — o registo. Fonte ÚNICA de verdade sobre modelos.
--    Nenhum ID de modelo volta a existir em código de negócio.
-- ---------------------------------------------------------------------
create table if not exists ai_models (
  id                     uuid primary key default gen_random_uuid(),
  provider_id            text not null references ai_providers(id) on delete restrict,
  -- O identificador REAL enviado ao fornecedor (ex.: 'us.openai.gpt-5.6-terra').
  provider_model_id      text not null,
  display_name           text not null,
  family                 text,                       -- 'gpt-5.6' | 'gemini-3.5' | 'claude-4.5'
  -- ACTIVE: uso normal · DEGRADED: a evitar, ainda funciona
  -- DISABLED: desligado por nós · DEPRECATED: fim anunciado pelo fornecedor
  -- RETIRED: já não responde
  status                 text not null default 'ACTIVE'
                         check (status in ('ACTIVE','DEGRADED','DISABLED','DEPRECATED','RETIRED')),
  enabled                boolean not null default true,

  -- capacidades (o router só escolhe modelos que sabem fazer o pedido)
  supports_streaming     boolean not null default true,
  supports_tools         boolean not null default false,
  supports_vision        boolean not null default false,
  supports_structured_output boolean not null default false,
  context_window         integer,

  -- custo por 1M de tokens, na moeda de faturação do fornecedor (USD)
  input_cost             numeric(10,4),
  output_cost            numeric(10,4),
  cached_input_cost      numeric(10,4),

  -- gestão de fim de vida — resolve a dor de 21 ago 2026
  replacement_model_id   uuid references ai_models(id) on delete set null,
  deprecation_date       date,
  shutdown_date          date,

  priority               integer not null default 100, -- menor = preferido
  -- saúde: escrita pelo health registry, lida pelo router
  health_status          text not null default 'UNKNOWN'
                         check (health_status in ('HEALTHY','DEGRADED','UNHEALTHY','UNKNOWN')),
  last_health_check      timestamptz,
  -- estado do disjuntor
  circuit_state          text not null default 'CLOSED'
                         check (circuit_state in ('CLOSED','OPEN','HALF_OPEN')),
  circuit_opened_at      timestamptz,
  -- limiares por modelo (nada hardcoded)
  circuit_error_threshold  numeric(4,3) not null default 0.500,  -- 50% de erros
  circuit_window_seconds   integer      not null default 300,
  circuit_cooldown_seconds integer      not null default 120,
  circuit_min_samples      integer      not null default 5,

  notas                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (provider_id, provider_model_id)
);
drop trigger if exists ai_models_updated on ai_models;
create trigger ai_models_updated before update on ai_models
  for each row execute function set_updated_at();

create index if not exists ai_models_routable on ai_models (enabled, status, priority)
  where enabled and status in ('ACTIVE','DEGRADED');

-- ---------------------------------------------------------------------
-- 3. ASSISTANTS — um colaborador digital por marca
-- ---------------------------------------------------------------------
create table if not exists ai_assistants (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid references orgs(id) on delete cascade,  -- null = interno do Nº 5
  -- chave PÚBLICA usada pelo site (como uma publishable key): identifica,
  -- não autoriza. A autorização real é o allowed_domains + resolução
  -- server-side. Nunca colocar segredos aqui.
  assistant_key     text unique not null,
  nome              text not null,                 -- 'Kianda', 'Joaquim', 'Mestre'
  marca             text,                          -- 'Água Minda'
  descricao         text,
  allowed_domains   text[] not null default '{}',
  ativo             boolean not null default true,

  -- rollout progressivo legacy → gateway, sem deploy
  legacy_enabled     boolean not null default true,
  gateway_enabled    boolean not null default false,
  traffic_percentage integer not null default 0 check (traffic_percentage between 0 and 100),
  rollback_target    text,                          -- URL do caminho antigo

  -- política de routing usada (ver ai_routing_policies)
  routing_policy_id uuid,
  -- limites de âmbito do pedido
  max_messages      integer not null default 16,
  max_chars_message integer not null default 2000,
  max_output_tokens integer not null default 1024,
  temperature       numeric(3,2) not null default 0.70,

  -- RGPD: retenção configurável POR organização
  retention_days    integer not null default 90,
  anonymize_after_days integer,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
drop trigger if exists ai_assistants_updated on ai_assistants;
create trigger ai_assistants_updated before update on ai_assistants
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 4. ROUTING POLICIES — que modelo para que classe de pedido
--    P0: determinístico. Sem LLM a decidir qual LLM chamar.
-- ---------------------------------------------------------------------
create table if not exists ai_routing_policies (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  descricao   text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists ai_routing_policies_updated on ai_routing_policies;
create trigger ai_routing_policies_updated before update on ai_routing_policies
  for each row execute function set_updated_at();

-- Cadeia ordenada: PRIMARY → FALLBACK_1 → FALLBACK_2 → EMERGENCY.
-- Fallback por capacidade equivalente, nunca aleatório.
create table if not exists ai_routing_rules (
  id          uuid primary key default gen_random_uuid(),
  policy_id   uuid not null references ai_routing_policies(id) on delete cascade,
  request_class text not null default 'STANDARD'
                check (request_class in ('STATIC','FAQ','SIMPLE','STANDARD','COMPLEX','HIGH_VALUE_COMMERCIAL','RISKY')),
  role        text not null check (role in ('PRIMARY','FALLBACK_1','FALLBACK_2','EMERGENCY')),
  model_id    uuid not null references ai_models(id) on delete restrict,
  created_at  timestamptz not null default now(),
  unique (policy_id, request_class, role)
);

alter table ai_assistants
  drop constraint if exists ai_assistants_routing_policy_fk;
alter table ai_assistants
  add constraint ai_assistants_routing_policy_fk
  foreign key (routing_policy_id) references ai_routing_policies(id) on delete set null;

-- ---------------------------------------------------------------------
-- 5. HEALTH — janela recente por modelo, alimentada pelos pedidos reais
--    e pelas probes sintéticas.
-- ---------------------------------------------------------------------
create table if not exists ai_model_health (
  id                 uuid primary key default gen_random_uuid(),
  model_id           uuid not null references ai_models(id) on delete cascade,
  window_start       timestamptz not null,
  window_seconds     integer not null default 300,
  requests           integer not null default 0,
  successes          integer not null default 0,
  errors             integer not null default 0,
  rate_limited       integer not null default 0,   -- 429
  server_errors      integer not null default 0,   -- 5xx
  timeouts           integer not null default 0,
  ttft_p50_ms        integer,
  ttft_p95_ms        integer,
  latency_p50_ms     integer,
  latency_p95_ms     integer,
  latency_p99_ms     integer,
  last_success_at    timestamptz,
  last_failure_at    timestamptz,
  last_error_code    text,
  created_at         timestamptz not null default now(),
  unique (model_id, window_start)
);
create index if not exists ai_model_health_recente on ai_model_health (model_id, window_start desc);

-- Probes sintéticas: detetar antes do utilizador. Prompt mínimo, custo mínimo.
create table if not exists ai_probes (
  id          uuid primary key default gen_random_uuid(),
  model_id    uuid not null references ai_models(id) on delete cascade,
  ok          boolean not null,
  ttft_ms     integer,
  latency_ms  integer,
  error_code  text,
  error_msg   text,
  created_at  timestamptz not null default now()
);
create index if not exists ai_probes_recente on ai_probes (model_id, created_at desc);

-- ---------------------------------------------------------------------
-- 6. LEDGER — todos os pedidos. Base de custo, qualidade e diagnóstico.
-- ---------------------------------------------------------------------
create table if not exists ai_requests (
  id                uuid primary key default gen_random_uuid(),
  request_id        text not null,
  trace_id          text,
  org_id            uuid references orgs(id) on delete set null,
  assistant_id      uuid references ai_assistants(id) on delete set null,
  conversation_id   uuid,
  session_id        text,

  requested_class   text,
  provider_id       text,
  model_id          uuid references ai_models(id) on delete set null,
  provider_model_id text,                    -- congelado: o registo pode mudar depois
  routing_reason    text,
  routing_version   text,
  fallback_used     boolean not null default false,
  fallback_reason   text,
  attempt_chain     jsonb not null default '[]'::jsonb,  -- histórico das tentativas

  input_tokens      integer,
  output_tokens     integer,
  cached_tokens     integer,
  estimated_cost    numeric(12,6),

  ttft_ms           integer,
  total_latency_ms  integer,
  gateway_ms        integer,                 -- overhead nosso, sem o fornecedor

  status            text not null default 'ok'
                    check (status in ('ok','error','blocked','timeout','budget_exceeded','rate_limited')),
  error_code        text,
  streamed          boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists ai_requests_org_data on ai_requests (org_id, created_at desc);
create index if not exists ai_requests_assistant_data on ai_requests (assistant_id, created_at desc);
create index if not exists ai_requests_modelo_data on ai_requests (model_id, created_at desc);
create index if not exists ai_requests_request_id on ai_requests (request_id);

-- ---------------------------------------------------------------------
-- 7. BUDGETS — duráveis. Nunca mais tetos só em memória.
-- ---------------------------------------------------------------------
create table if not exists ai_budgets (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid references orgs(id) on delete cascade,
  assistant_id     uuid references ai_assistants(id) on delete cascade,
  daily_limit_usd  numeric(10,2),
  monthly_limit_usd numeric(10,2),
  soft_threshold   numeric(4,3) not null default 0.800,   -- 80% → alerta
  critical_threshold numeric(4,3) not null default 0.950, -- 95% → alerta crítico
  -- ao atingir 100%
  exhausted_policy text not null default 'ROUTE_CHEAPER'
                   check (exhausted_policy in ('BLOCK','ROUTE_CHEAPER')),
  cheaper_model_id uuid references ai_models(id) on delete set null,
  ativo            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- um orçamento por alvo (org global OU assistente específico)
  unique (org_id, assistant_id)
);
drop trigger if exists ai_budgets_updated on ai_budgets;
create trigger ai_budgets_updated before update on ai_budgets
  for each row execute function set_updated_at();

-- Contadores duráveis, por período. Incrementados transaccionalmente.
create table if not exists ai_budget_counters (
  id           uuid primary key default gen_random_uuid(),
  budget_id    uuid not null references ai_budgets(id) on delete cascade,
  period       text not null check (period in ('day','month')),
  period_key   text not null,                       -- '2026-08-21' | '2026-08'
  spent_usd    numeric(12,6) not null default 0,
  requests     integer not null default 0,
  updated_at   timestamptz not null default now(),
  unique (budget_id, period, period_key)
);

-- ---------------------------------------------------------------------
-- 8. RATE LIMITS — duráveis, em Postgres (sem Redis até haver prova
--    de que é preciso). Abstraído no core para poder migrar depois.
-- ---------------------------------------------------------------------
create table if not exists ai_rate_limits (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null check (scope in ('ip','session','assistant','org','key')),
  -- Para 'ip' guardamos um hash, não o IP em claro (minimização RGPD).
  scope_key    text not null,
  window_start timestamptz not null,
  window_seconds integer not null,
  count        integer not null default 0,
  updated_at   timestamptz not null default now(),
  unique (scope, scope_key, window_seconds, window_start)
);
create index if not exists ai_rate_limits_limpeza on ai_rate_limits (window_start);

-- ---------------------------------------------------------------------
-- 9. INCIDENTS — o que correu mal, para o dashboard e alertas
-- ---------------------------------------------------------------------
create table if not exists ai_incidents (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in (
                 'PROVIDER_UNHEALTHY','MODEL_UNHEALTHY','HIGH_ERROR_RATE',
                 'BUDGET_SOFT','BUDGET_CRITICAL','BUDGET_EXHAUSTED',
                 'CIRCUIT_OPEN','TRAFFIC_SPIKE','MODEL_DEPRECATED')),
  severidade   text not null default 'warn' check (severidade in ('info','warn','crit')),
  provider_id  text references ai_providers(id) on delete set null,
  model_id     uuid references ai_models(id) on delete set null,
  org_id       uuid references orgs(id) on delete set null,
  assistant_id uuid references ai_assistants(id) on delete set null,
  titulo       text not null,
  detalhe      jsonb not null default '{}'::jsonb,
  resolvido    boolean not null default false,
  resolvido_em timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists ai_incidents_abertos on ai_incidents (resolvido, created_at desc);

-- =====================================================================
-- RLS — mesmo padrão de 0046/0067, já provado em produção.
-- Operação (providers, models, routing, health, probes, incidents) é só
-- da equipa. Dados com org_id são visíveis à org respetiva.
-- =====================================================================
alter table ai_providers        enable row level security;
alter table ai_models           enable row level security;
alter table ai_routing_policies enable row level security;
alter table ai_routing_rules    enable row level security;
alter table ai_model_health     enable row level security;
alter table ai_probes           enable row level security;
alter table ai_rate_limits      enable row level security;
alter table ai_assistants       enable row level security;
alter table ai_requests         enable row level security;
alter table ai_budgets          enable row level security;
alter table ai_budget_counters  enable row level security;
alter table ai_incidents        enable row level security;

-- tabelas de operação: SÓ equipa do Nº 5
do $$
declare t text;
begin
  foreach t in array array[
    'ai_providers','ai_models','ai_routing_policies','ai_routing_rules',
    'ai_model_health','ai_probes','ai_rate_limits','ai_budget_counters','ai_incidents'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_staff', t);
    execute format(
      'create policy %I on %I for all to authenticated '
      'using (n5_is_staff()) with check (n5_is_staff())', t || '_staff', t);
  end loop;
end $$;

-- tabelas com org_id: equipa vê tudo; cliente só a sua org.
-- Escrita continua reservada à equipa (o gateway escreve via service role).
do $$
declare t text;
begin
  foreach t in array array['ai_assistants','ai_requests','ai_budgets'] loop
    execute format('drop policy if exists %I on %I', t || '_acesso', t);
    execute format(
      'create policy %I on %I for select to authenticated '
      'using (n5_is_staff() or org_id in (select n5_org_ids()))', t || '_acesso', t);
    execute format('drop policy if exists %I on %I', t || '_escrita', t);
    execute format(
      'create policy %I on %I for all to authenticated '
      'using (n5_is_staff()) with check (n5_is_staff())', t || '_escrita', t);
  end loop;
end $$;

-- =====================================================================
-- SEED — providers e modelos VALIDADOS em documentação oficial e/ou
-- testados em produção a 21 ago 2026. Sem adivinhação.
-- =====================================================================
insert into ai_providers (id, display_name, adapter, base_url, api_key_env, enabled, notas) values
  ('google','Google AI Studio','google','https://generativelanguage.googleapis.com/v1beta','GEMINI_API_KEY',true,
   'Conta pré-paga com recarga automática. Nota: modelos 2.5 dão 404 "no longer available to new users" NESTE projeto — é bloqueio de conta, não retirada global.'),
  ('openai','OpenAI','openai','https://api.openai.com/v1','OPENAI_API_KEY',false,
   'Segundo fornecedor. Ativar assim que a chave estiver no ambiente.'),
  ('anthropic','Anthropic','anthropic','https://api.anthropic.com/v1','ANTHROPIC_API_KEY',false,
   'Terceiro fornecedor. Ativar quando a conta estiver operacional.'),
  ('bedrock','AWS Bedrock','openai','https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1','BEDROCK_API_KEY',false,
   'GPT-5.6 Sol/Terra/Luna, GA 13 jul 2026. Superfície compatível com OpenAI, por isso reutiliza o adaptador openai. ATENÇÃO RGPD: sem perfil Geo EU — nas regiões UE só existe global CRIS (routing mundial).')
on conflict (id) do nothing;

-- Modelos Google testados em produção a 21/08/2026 (resposta 200 verificada)
insert into ai_models (provider_id, provider_model_id, display_name, family, status, priority,
                       supports_streaming, context_window, input_cost, output_cost, notas)
values
  ('google','gemini-pro-latest','Gemini Pro (latest)','gemini-pro','ACTIVE',10,true,null,null,null,
   'Testado OK 21/08/2026. Alias: sujeito a hot-swap com 2 semanas de aviso — não é ideal como primário a longo prazo.'),
  ('google','gemini-3.5-flash','Gemini 3.5 Flash','gemini-3.5','ACTIVE',20,true,null,null,null,
   'Testado OK 21/08/2026. Versão explícita — preferível a alias.'),
  ('google','gemini-flash-lite-latest','Gemini Flash Lite (latest)','gemini-3.5','ACTIVE',30,true,null,null,null,
   'Testado OK 21/08/2026 (resolveu para gemini-3.5-flash-lite). Barato, bom para SIMPLE/FAQ.'),
  ('google','gemini-3.1-flash-lite','Gemini 3.1 Flash Lite','gemini-3.1','ACTIVE',40,true,null,null,null,
   'Testado OK 21/08/2026. Shutdown anunciado para 07/05/2027 — substituir por gemini-3.5-flash-lite.')
on conflict (provider_id, provider_model_id) do nothing;

-- Modelos com problema conhecido: registados como aviso, desligados para routing.
insert into ai_models (provider_id, provider_model_id, display_name, family, status, enabled,
                       shutdown_date, notas)
values
  ('google','gemini-2.0-flash','Gemini 2.0 Flash','gemini-2.0','RETIRED',false,'2026-06-01',
   'Desligado pela Google a 01/06/2026 (oficial). Causa raiz do incidente de 21/08/2026 — estava como reserva em 4 repositórios.'),
  ('google','gemini-flash-latest','Gemini Flash (latest)','gemini-3.x','DEGRADED',false,null,
   'Devolveu 503 "high demand" de forma intermitente a 21/08/2026. Alias instável — não usar como primário.'),
  ('google','gemini-2.5-pro','Gemini 2.5 Pro','gemini-2.5','DISABLED',false,null,
   'Estável na documentação oficial (sem shutdown), mas 404 NESTE projeto: "no longer available to new users". Bloqueio de conta.'),
  ('google','gemini-2.5-flash','Gemini 2.5 Flash','gemini-2.5','DISABLED',false,null,
   'Idem: estável oficialmente, mas 404 neste projeto.')
on conflict (provider_id, provider_model_id) do nothing;

-- Modelos Bedrock/OpenAI validados na documentação oficial AWS (21/08/2026).
-- Ficam DISABLED até a chave estar no ambiente e o adaptador testado.
insert into ai_models (provider_id, provider_model_id, display_name, family, status, enabled, priority,
                       supports_streaming, supports_tools, supports_vision, context_window,
                       input_cost, output_cost, cached_input_cost, notas)
values
  ('bedrock','global.openai.gpt-5.6-terra','GPT-5.6 Terra (Bedrock)','gpt-5.6','ACTIVE',false,15,
   true,false,true,1000000,2.00,12.00,0.20,
   'Global CRIS. Preços de 272K de contexto; acima disso passa a 4.00/18.00. Doc AWS 21/08/2026.'),
  ('bedrock','global.openai.gpt-5.6-luna','GPT-5.6 Luna (Bedrock)','gpt-5.6','ACTIVE',false,25,
   true,false,true,1000000,null,null,null,
   'O mais barato da família. Bom candidato para SIMPLE/FAQ. Confirmar preço na consola antes de ativar.'),
  ('bedrock','global.openai.gpt-5.6-sol','GPT-5.6 Sol (Bedrock)','gpt-5.6','ACTIVE',false,5,
   true,false,true,1000000,null,null,null,
   'O mais capaz. Reservar para COMPLEX/HIGH_VALUE_COMMERCIAL. Confirmar preço antes de ativar.')
on conflict (provider_id, provider_model_id) do nothing;

-- Política de routing por defeito, ligada aos modelos que sabemos estarem de pé.
insert into ai_routing_policies (nome, descricao)
values ('default','Política inicial: Google como primário, cadeia de reserva por capacidade equivalente.')
on conflict do nothing;

do $$
declare
  pol uuid;
  m_pro uuid; m_flash uuid; m_lite uuid;
begin
  select id into pol from ai_routing_policies where nome = 'default' limit 1;
  select id into m_pro   from ai_models where provider_model_id = 'gemini-pro-latest' limit 1;
  select id into m_flash from ai_models where provider_model_id = 'gemini-3.5-flash' limit 1;
  select id into m_lite  from ai_models where provider_model_id = 'gemini-flash-lite-latest' limit 1;
  if pol is null or m_pro is null then return; end if;

  -- STANDARD: qualidade primeiro, com duas reservas reais
  insert into ai_routing_rules (policy_id, request_class, role, model_id) values
    (pol,'STANDARD','PRIMARY',    m_pro),
    (pol,'STANDARD','FALLBACK_1', m_flash),
    (pol,'STANDARD','FALLBACK_2', m_lite)
  on conflict (policy_id, request_class, role) do nothing;

  -- SIMPLE/FAQ: barato primeiro, sobe se falhar
  insert into ai_routing_rules (policy_id, request_class, role, model_id) values
    (pol,'SIMPLE','PRIMARY',    m_lite),
    (pol,'SIMPLE','FALLBACK_1', m_flash),
    (pol,'FAQ','PRIMARY',       m_lite),
    (pol,'FAQ','FALLBACK_1',    m_flash)
  on conflict (policy_id, request_class, role) do nothing;

  -- COMPLEX: o melhor disponível
  insert into ai_routing_rules (policy_id, request_class, role, model_id) values
    (pol,'COMPLEX','PRIMARY',    m_pro),
    (pol,'COMPLEX','FALLBACK_1', m_flash)
  on conflict (policy_id, request_class, role) do nothing;
end $$;

-- Assistente piloto: o Mestre. Entra a 0% de tráfego — nada muda até decidirmos.
do $$
declare pol uuid;
begin
  select id into pol from ai_routing_policies where nome = 'default' limit 1;
  insert into ai_assistants (assistant_key, nome, marca, descricao, allowed_domains,
                             routing_policy_id, gateway_enabled, traffic_percentage, rollback_target)
  values ('mestre-linhas-gerais','Mestre','Linhas Gerais',
          'Piloto do N5 AI OS. Escolhido por baixo tráfego e por já ter 2 de 4 modelos mortos na lista antiga.',
          array['https://linhasgerais.pt','https://www.linhasgerais.pt'],
          pol, false, 0, '/api/mestre')
  on conflict (assistant_key) do nothing;
end $$;

-- registo da migração (convenção 0068)
insert into schema_migrations (version) values ('0071')
on conflict (version) do nothing;
