-- =====================================================================
-- Nº 5 · Relatórios — detalhe por publicação + reações do cliente (Fase 2)
--
-- O relatório passa a guardar os posts do mês (do Metricool, conector "posts"):
-- título, tipo, alcance, interações, guardados, partilhas, url. Na página do
-- relatório, o cliente reage a cada post ("mais disto" / "menos disto" /
-- "favorito") — e nós vemos o resumo na app, para afinar o conteúdo do mês
-- seguinte. Fecha o ciclo: planear → produzir → medir por post → decidir.
--
-- Correr no SQL Editor do Supabase. Seguro de correr novamente.
-- =====================================================================

-- Fotografia dos posts do mês (para render + reações). Tolerante: pode faltar.
alter table relatorios add column if not exists posts jsonb;

create table if not exists relatorio_post_reacoes (
  id            uuid primary key default gen_random_uuid(),
  relatorio_id  uuid not null references relatorios(id) on delete cascade,
  post_url      text not null,             -- identifica o post dentro do relatório
  reacao        text not null check (reacao in ('mais','menos','favorito')),
  nota          text,                       -- comentário livre do cliente (opcional)
  autor         text not null default 'cliente' check (autor in ('cliente','equipa')),
  created_at    timestamptz not null default now(),
  -- uma reação por post e por autor (o cliente pode trocar, faz-se upsert)
  unique (relatorio_id, post_url, autor)
);
create index if not exists relatorio_post_reacoes_rel_idx on relatorio_post_reacoes (relatorio_id);

alter table relatorio_post_reacoes enable row level security;
-- Só a equipa lê pelo PostgREST (as páginas públicas leem/escrevem por service role).
drop policy if exists relatorio_post_reacoes_staff on relatorio_post_reacoes;
create policy relatorio_post_reacoes_staff on relatorio_post_reacoes
  for all to authenticated using (n5_is_staff()) with check (n5_is_staff());

insert into schema_migrations(version) values ('0070') on conflict do nothing;
