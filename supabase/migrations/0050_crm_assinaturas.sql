-- =====================================================================
-- Nº 5 · CRM — faturação do serviço (assinatura por cliente)      [0050]
-- ---------------------------------------------------------------------
-- Regista quanto o Nº 5 cobra a cada cliente pelo CRM: setup + avença.
-- Só a equipa do Nº 5 vê/edita (RLS staff). Uma assinatura por org.
-- =====================================================================
create table if not exists org_assinaturas (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null unique references orgs(id) on delete cascade,
  plano        text,                                    -- ex.: 'Motor', 'CRM add-on'
  setup_valor  numeric(10,2),
  setup_pago   boolean not null default false,
  avenca_valor numeric(10,2),
  estado       text not null default 'ativa' check (estado in ('ativa','pausada','terminada')),
  dia_cobranca int check (dia_cobranca between 1 and 28),
  inicio       date not null default current_date,
  notas        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists org_assinaturas_estado_idx on org_assinaturas (estado);

drop trigger if exists org_assinaturas_updated on org_assinaturas;
create trigger org_assinaturas_updated before update on org_assinaturas
  for each row execute function set_updated_at();

alter table org_assinaturas enable row level security;
drop policy if exists org_assinaturas_acesso on org_assinaturas;
create policy org_assinaturas_acesso on org_assinaturas for all to authenticated
  using (n5_is_staff()) with check (n5_is_staff());
