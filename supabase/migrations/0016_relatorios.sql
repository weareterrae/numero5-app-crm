-- =====================================================================
-- Nº 5 · Relatórios mensais de resultados, partilhados com o cliente
--
-- Produzidos no Claude Code (puxo as métricas do Metricool + escrevo na
-- voz do Nº 5, números antes de adjetivos), colados na ficha, partilhados
-- por link. O cliente vê o que aconteceu no mês. É o que justifica a avença.
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

create table if not exists relatorios (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id) on delete cascade,
  mes            date not null,                     -- 1.º dia do mês relatado
  titulo         text,
  conteudo_html  text not null default '',          -- o relatório, em HTML
  estado         text not null default 'rascunho'
                   check (estado in ('rascunho','enviado')),
  partilha_token uuid unique default gen_random_uuid(),
  partilha_ativa boolean not null default false,
  enviado_em     timestamptz,
  visto_em       timestamptz,                        -- quando o cliente abriu
  criado_por     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists relatorios_cliente_idx on relatorios (cliente_id, mes desc);

drop trigger if exists relatorios_updated on relatorios;
create trigger relatorios_updated before update on relatorios
  for each row execute function set_updated_at();

alter table relatorios enable row level security;
drop policy if exists relatorios_auth_all on relatorios;
create policy relatorios_auth_all on relatorios for all to authenticated using (true) with check (true);

-- Que marca do Metricool corresponde a este cliente (blogId), para eu saber
-- de onde puxar as métricas ao produzir o relatório no Claude Code.
alter table clientes add column if not exists metricool_blog_id text;
