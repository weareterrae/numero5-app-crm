-- =====================================================================
-- Nº 5 · Motor de conteúdo — as peças do mês, geradas pela IA
--
-- Dado um cliente e um breve, a IA produz o mês de conteúdo na voz da
-- marca do cliente. Cada peça fica guardada, editável e aprovável — para
-- o comercial rever, afinar e depois agendar (Metricool).
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

create table if not exists conteudos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes(id) on delete cascade,
  mes         date not null,                    -- 1.º dia do mês
  tipo        text not null check (tipo in ('post','carrossel','reel','story','outro')),
  tema        text,
  copy        text not null default '',         -- a legenda / texto principal
  hashtags    jsonb not null default '[]'::jsonb,
  extra       jsonb not null default '{}'::jsonb, -- {slides:[], guiao:""} para carrossel/reel
  estado      text not null default 'rascunho' check (estado in ('rascunho','aprovado')),
  ordem       int not null default 0,
  criado_por  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists conteudos_cliente_mes_idx on conteudos (cliente_id, mes desc);

drop trigger if exists conteudos_updated on conteudos;
create trigger conteudos_updated before update on conteudos
  for each row execute function set_updated_at();

alter table conteudos enable row level security;
drop policy if exists conteudos_auth_all on conteudos;
create policy conteudos_auth_all on conteudos for all to authenticated using (true) with check (true);
