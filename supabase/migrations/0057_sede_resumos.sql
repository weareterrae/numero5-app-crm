-- 0057 — Resumo mensal proativo do assistente da Sede
-- O assistente escreve, uma vez por mês, um resumo do mês + uma proposta de
-- rumo para o mês seguinte. Guardado para não voltar a gerar (custo) e para o
-- cliente reler. Um por cliente/mês.

create table if not exists sede_resumos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  mes date not null,                 -- 1.º dia do mês a que respeita
  texto text not null,
  criado_em timestamptz not null default now(),
  unique (cliente_id, mes)
);

create index if not exists sede_resumos_idx on sede_resumos (cliente_id, mes desc);

alter table sede_resumos enable row level security;
create policy sede_resumos_auth_all on sede_resumos for all to authenticated using (true) with check (true);

comment on table sede_resumos is 'Resumo mensal do assistente da Sede (recap + proposta para o mês seguinte).';
