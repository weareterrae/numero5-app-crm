-- 0042_biblioteca.sql
-- Fase 2, Prioridade 2 — Biblioteca de conteúdos por cliente (temas, formatos,
-- desempenho, reutilização) + direitos/licenças de cada peça (Partes 38-39, 46-47).

create table if not exists biblioteca_conteudos (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references clientes(id) on delete cascade,
  tema         text not null,
  formato      text,                                  -- post|carrossel|reel|story|artigo|video|email
  canal        text,
  data         date,
  desempenho   text,                                  -- fraco|medio|bom|otimo
  reutilizavel boolean not null default true,
  origem       text,                                  -- cliente|nº5|banco|licenca|ia
  licenca      text,                                  -- livre|com licenca|autorizada|restrita
  notas        text,
  autor_id     uuid references auth.users(id),
  criado_em    timestamptz not null default now()
);

create index if not exists biblioteca_cliente_idx on biblioteca_conteudos (cliente_id, data desc);

alter table biblioteca_conteudos enable row level security;
drop policy if exists biblioteca_auth_all on biblioteca_conteudos;
create policy biblioteca_auth_all on biblioteca_conteudos for all to authenticated using (true) with check (true);
