-- =====================================================================
-- Nº 5 · CRM multi-cliente (multi-tenant)                       [0046]
-- ---------------------------------------------------------------------
-- Módulo NOVO, separado do CRM interno do Nº 5 (tabelas clientes/…).
-- Cada "org" é um cliente da agência (ex.: o Externato). Cada org tem o
-- seu funil de leads, ISOLADO por RLS: um cliente nunca vê os de outro.
--   · Equipa do Nº 5  (profiles.externo = false) → vê/gere TODAS as orgs.
--   · Utilizador cliente (profiles.externo = true) → só a(s) sua(s) org(s).
-- Depende só de 0001 (profiles, set_updated_at). Aditivo e idempotente.
-- =====================================================================

-- distinguir equipa do Nº 5 (interna) de utilizadores externos (clientes)
alter table profiles add column if not exists externo boolean not null default false;

-- ---------------------------------------------------------------------
-- 1. ORGS — cada cliente da agência
-- ---------------------------------------------------------------------
create table if not exists orgs (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  slug       text unique not null,
  marca      jsonb not null default '{}'::jsonb,   -- {cor, logo_url, …} p/ white-label futuro
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists orgs_updated on orgs;
create trigger orgs_updated before update on orgs
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 2. ORG_MEMBROS — que utilizador pertence a que org (e com que papel)
-- ---------------------------------------------------------------------
create table if not exists org_membros (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  papel      text not null default 'cliente' check (papel in ('dono','gestor','cliente')),
  created_at timestamptz not null default now(),
  unique (org_id, profile_id)
);
create index if not exists org_membros_profile_idx on org_membros (profile_id);
create index if not exists org_membros_org_idx     on org_membros (org_id);

-- ---------------------------------------------------------------------
-- 3. ORG_TOKENS — tokens de ingestão de leads (um por integração)
--    (aleatório; nunca fica no repositório — lê-se da BD para pôr no Make)
-- ---------------------------------------------------------------------
create table if not exists org_tokens (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  token      text unique not null default replace(gen_random_uuid()::text, '-', ''),
  nome       text not null default 'Integração',
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists org_tokens_org_idx on org_tokens (org_id);

-- ---------------------------------------------------------------------
-- 4. CRM_ETAPAS — as colunas do funil, configuráveis por org
-- ---------------------------------------------------------------------
create table if not exists crm_etapas (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  chave      text not null,
  titulo     text not null,
  ordem      int  not null default 0,
  tipo       text not null default 'aberto' check (tipo in ('aberto','ganho','perdido')),
  created_at timestamptz not null default now(),
  unique (org_id, chave)
);
create index if not exists crm_etapas_org_idx on crm_etapas (org_id, ordem);

-- ---------------------------------------------------------------------
-- 5. CRM_LEADS — as leads de cada org
-- ---------------------------------------------------------------------
create table if not exists crm_leads (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references orgs(id) on delete cascade,
  etapa_id             uuid references crm_etapas(id) on delete set null,
  nome                 text,
  telefone             text,
  email                text,
  campos               jsonb not null default '{}'::jsonb,  -- respostas extra do formulário
  origem               text,          -- ex.: 'meta_instant_form', 'site', 'manual'
  fonte_detalhe        text,          -- ex.: nome do anúncio/campanha
  notas                text,
  dono_id              uuid references profiles(id) on delete set null,
  resultado            text not null default 'aberto' check (resultado in ('aberto','ganho','perdido')),
  motivo_perda         text,
  primeira_resposta_at timestamptz,   -- 1.ª interação (métrica de velocidade)
  ultima_atividade_at  timestamptz,
  arquivado            boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists crm_leads_org_idx       on crm_leads (org_id, created_at desc);
create index if not exists crm_leads_etapa_idx     on crm_leads (etapa_id);
create index if not exists crm_leads_org_email_idx on crm_leads (org_id, lower(email));
drop trigger if exists crm_leads_updated on crm_leads;
create trigger crm_leads_updated before update on crm_leads
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 6. CRM_ATIVIDADES — histórico + follow-ups por lead
-- ---------------------------------------------------------------------
create table if not exists crm_atividades (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  lead_id     uuid not null references crm_leads(id) on delete cascade,
  autor_id    uuid references profiles(id) on delete set null,
  tipo        text not null default 'nota'
                check (tipo in ('nota','chamada','email','mensagem','reuniao','sistema')),
  descricao   text not null,
  data        timestamptz not null default now(),
  followup_em date,
  concluido   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists crm_atividades_lead_idx     on crm_atividades (lead_id, data desc);
create index if not exists crm_atividades_followup_idx on crm_atividades (org_id, followup_em)
  where followup_em is not null and concluido = false;

-- ao registar atividade, toca a última atividade da lead
create or replace function crm_touch_lead()
returns trigger language plpgsql as $$
begin
  update crm_leads
     set ultima_atividade_at = greatest(coalesce(ultima_atividade_at, new.data), new.data)
   where id = new.lead_id;
  return new;
end $$;
drop trigger if exists crm_atividades_touch on crm_atividades;
create trigger crm_atividades_touch after insert on crm_atividades
  for each row execute function crm_touch_lead();

-- ---------------------------------------------------------------------
-- 7. CRM_ETAPA_HISTORICO — transições (para taxa de conversão do funil)
-- ---------------------------------------------------------------------
create table if not exists crm_etapa_historico (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  lead_id    uuid not null references crm_leads(id) on delete cascade,
  de_etapa   uuid,
  para_etapa uuid,
  mudado_por uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_etapa_hist_org_idx on crm_etapa_historico (org_id, created_at);

create or replace function crm_log_etapa()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    insert into crm_etapa_historico (org_id, lead_id, de_etapa, para_etapa)
    values (new.org_id, new.id, null, new.etapa_id);
  elsif (new.etapa_id is distinct from old.etapa_id) then
    insert into crm_etapa_historico (org_id, lead_id, de_etapa, para_etapa)
    values (new.org_id, new.id, old.etapa_id, new.etapa_id);
  end if;
  return new;
end $$;
drop trigger if exists crm_leads_log_etapa_ins on crm_leads;
create trigger crm_leads_log_etapa_ins after insert on crm_leads
  for each row execute function crm_log_etapa();
drop trigger if exists crm_leads_log_etapa_upd on crm_leads;
create trigger crm_leads_log_etapa_upd after update on crm_leads
  for each row execute function crm_log_etapa();

-- =====================================================================
-- 8. SEGURANÇA (RLS) — isolamento por org
-- ---------------------------------------------------------------------
-- Helpers security-definer (ignoram RLS → sem recursão nas políticas).
-- ---------------------------------------------------------------------
create or replace function n5_is_staff()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and coalesce(externo, false) = false)
$$;

create or replace function n5_org_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select org_id from org_membros where profile_id = auth.uid()
$$;

alter table orgs                enable row level security;
alter table org_membros         enable row level security;
alter table org_tokens          enable row level security;
alter table crm_etapas          enable row level security;
alter table crm_leads           enable row level security;
alter table crm_atividades      enable row level security;
alter table crm_etapa_historico enable row level security;

-- orgs: a coluna de âmbito é o próprio id
drop policy if exists orgs_acesso on orgs;
create policy orgs_acesso on orgs for all to authenticated
  using (n5_is_staff() or id in (select n5_org_ids()))
  with check (n5_is_staff());

-- org_membros: equipa vê tudo; cliente vê as suas linhas
drop policy if exists org_membros_acesso on org_membros;
create policy org_membros_acesso on org_membros for all to authenticated
  using (n5_is_staff() or profile_id = auth.uid())
  with check (n5_is_staff());

-- org_tokens: só equipa do Nº 5 (são segredos)
drop policy if exists org_tokens_acesso on org_tokens;
create policy org_tokens_acesso on org_tokens for all to authenticated
  using (n5_is_staff()) with check (n5_is_staff());

-- tabelas com org_id: equipa vê tudo; cliente só a sua org
do $$
declare t text;
begin
  foreach t in array array['crm_etapas','crm_leads','crm_atividades','crm_etapa_historico']
  loop
    execute format('drop policy if exists %I on %I', t||'_acesso', t);
    execute format(
      'create policy %I on %I for all to authenticated '
      'using (n5_is_staff() or org_id in (select n5_org_ids())) '
      'with check (n5_is_staff() or org_id in (select n5_org_ids()))',
      t||'_acesso', t);
  end loop;
end $$;

-- =====================================================================
-- 9. SEED — Externato Santa Maria de Belém: org + funil da escola + token
-- =====================================================================
do $$
declare v_org uuid;
begin
  insert into orgs (nome, slug) values ('Externato Santa Maria de Belém', 'externato-smb')
    on conflict (slug) do nothing;
  select id into v_org from orgs where slug = 'externato-smb';

  insert into crm_etapas (org_id, chave, titulo, ordem, tipo) values
    (v_org, 'nova',           'Nova',           1, 'aberto'),
    (v_org, 'contactada',     'Contactada',     2, 'aberto'),
    (v_org, 'visita_marcada', 'Visita marcada', 3, 'aberto'),
    (v_org, 'visitou',        'Visitou',        4, 'aberto'),
    (v_org, 'matriculada',    'Matriculada',    5, 'ganho'),
    (v_org, 'perdida',        'Perdida',        6, 'perdido')
  on conflict (org_id, chave) do nothing;

  -- token de ingestão (só se ainda não existir, para a migração ser idempotente)
  if not exists (select 1 from org_tokens where org_id = v_org) then
    insert into org_tokens (org_id, nome) values (v_org, 'Make · Meta Instant Form');
  end if;
end $$;
