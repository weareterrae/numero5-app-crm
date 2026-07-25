-- 0032_proposta_versoes.sql
-- Fase 2, Bloco 9 — Propostas versionadas. Cada versão guarda uma FOTOGRAFIA
-- imutável do catálogo, âmbito, condições e valores no momento em que foi
-- congelada. Alterar o catálogo depois NÃO mexe em propostas antigas.

create table if not exists proposta_versoes (
  id           uuid primary key default gen_random_uuid(),
  proposta_id  uuid not null references propostas(id) on delete cascade,
  versao       integer not null,
  snapshot     jsonb not null,        -- precos, escopo, escopo_pedido, condicoes, descontos, validade
  avenca_valor numeric,
  setup_valor  numeric,
  ambito       jsonb,                 -- string[] (o que o cliente lê)
  motivo       text,                  -- v2, alteração de âmbito, renovação, renegociação...
  enviada      boolean not null default false,
  aceite       boolean not null default false,
  autor_id     uuid references auth.users(id),
  criado_em    timestamptz not null default now(),
  unique (proposta_id, versao)
);

create index if not exists proposta_versoes_idx on proposta_versoes (proposta_id, versao desc);

alter table proposta_versoes enable row level security;
drop policy if exists proposta_versoes_auth_all on proposta_versoes;
create policy proposta_versoes_auth_all on proposta_versoes for all to authenticated using (true) with check (true);
