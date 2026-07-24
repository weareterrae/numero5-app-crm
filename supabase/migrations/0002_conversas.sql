-- =====================================================================
-- Nº 5 · Histórico das conversas com o Quinto (assistente interno)
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

create table if not exists conversas (
  id            uuid primary key default gen_random_uuid(),
  -- Com cliente: o fio condutor daquele negócio, visível a toda a equipa.
  -- Sem cliente (null): conversa geral, pessoal de cada utilizador.
  cliente_id    uuid references clientes(id) on delete cascade,
  utilizador_id uuid references profiles(id) on delete set null,
  papel         text not null check (papel in ('equipa','quinto')),
  texto         text not null,
  created_at    timestamptz not null default now()
);

create index if not exists conversas_cliente_idx
  on conversas (cliente_id, created_at)
  where cliente_id is not null;

create index if not exists conversas_geral_idx
  on conversas (utilizador_id, created_at)
  where cliente_id is null;

alter table conversas enable row level security;

drop policy if exists conversas_auth_all on conversas;
create policy conversas_auth_all on conversas
  for all to authenticated using (true) with check (true);
